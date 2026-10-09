import { pino } from 'pino';
import { buildHealthServer } from './adapters/inbound/http/health-server.js';
import { LedgerEventConsumerHealthIndicator } from './adapters/inbound/messaging/ledger-event-consumer-health-indicator.js';
import { LedgerMessageHandler } from './adapters/inbound/messaging/ledger-message-handler.js';
import { RabbitMqLedgerEventConsumer } from './adapters/inbound/messaging/rabbitmq-ledger-event-consumer.js';
import { LEDGER_EVENTS_TOPOLOGY } from './adapters/outbound/messaging/consumer-topology.js';
import { RabbitMqConnection } from './adapters/outbound/messaging/rabbitmq-connection.js';
import { RabbitMqHealthIndicator } from './adapters/outbound/messaging/rabbitmq-health-indicator.js';
import { createPool, PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresHealthIndicator } from './adapters/outbound/postgres/postgres-health-indicator.js';
import { loadConsumerEnv } from './config/env.js';
import { createDailyBalanceUseCases } from './container.js';

const env = loadConsumerEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: env.SERVICE_NAME } });

const database = new PostgresDatabase(
  createPool({
    connectionString: env.DATABASE_URL,
    maxConnections: env.DATABASE_POOL_SIZE,
    onIdleClientError: (error) => logger.warn({ err: error }, 'idle database connection lost'),
  }),
);
const connection = await RabbitMqConnection.open(env.RABBITMQ_URL, logger);
const { consolidateMovement } = createDailyBalanceUseCases(database);

const consumer = new RabbitMqLedgerEventConsumer({
  connection,
  handler: new LedgerMessageHandler({
    consolidate: consolidateMovement,
    maxAttempts: env.CONSUMER_MAX_ATTEMPTS,
  }),
  topology: LEDGER_EVENTS_TOPOLOGY,
  prefetch: env.CONSUMER_PREFETCH,
  retryDelayMs: env.CONSUMER_RETRY_DELAY_MS,
  logger,
});

const healthServer = buildHealthServer({
  logger,
  healthIndicators: [
    new PostgresHealthIndicator(database),
    new RabbitMqHealthIndicator(connection),
    new LedgerEventConsumerHealthIndicator(consumer),
  ],
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  await consumer.stop();
  await healthServer.close();
  await connection.close();
  await database.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

consumer.start();
await healthServer.listen({ host: '0.0.0.0', port: env.PORT });

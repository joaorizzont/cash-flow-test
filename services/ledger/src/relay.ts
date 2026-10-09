import { LEDGER_EVENTS_EXCHANGE } from '@cash-flow/contracts';
import { pino } from 'pino';
import { buildHealthServer } from './adapters/inbound/http/health-server.js';
import { OutboxMetrics } from './adapters/inbound/scheduler/outbox-metrics.js';
import { PollingWorker } from './adapters/inbound/scheduler/polling-worker.js';
import { RabbitMqConnection } from './adapters/outbound/messaging/rabbitmq-connection.js';
import { RabbitMqEventPublisher } from './adapters/outbound/messaging/rabbitmq-event-publisher.js';
import { RabbitMqHealthIndicator } from './adapters/outbound/messaging/rabbitmq-health-indicator.js';
import { createPool, PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresHealthIndicator } from './adapters/outbound/postgres/postgres-health-indicator.js';
import { PostgresOutboxStore } from './adapters/outbound/postgres/postgres-outbox-store.js';
import { SystemClock } from './adapters/outbound/system/system-clock.js';
import { PublishPendingEventsService } from './application/index.js';
import { loadRelayEnv } from './config/env.js';

const env = loadRelayEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: env.SERVICE_NAME } });

const database = new PostgresDatabase(
  createPool({
    connectionString: env.DATABASE_URL,
    maxConnections: env.DATABASE_POOL_SIZE,
    onIdleClientError: (error) => logger.warn({ err: error }, 'idle database connection lost'),
  }),
);
const connection = await RabbitMqConnection.open(env.RABBITMQ_URL, logger);
const publisher = new RabbitMqEventPublisher(connection, LEDGER_EVENTS_EXCHANGE);

const outbox = new PostgresOutboxStore(database);
const clock = new SystemClock();
const outboxMetrics = new OutboxMetrics();
outboxMetrics.observeBacklog(() => outbox.backlog(), clock);

const publishPendingEvents = new PublishPendingEventsService({
  outbox,
  publisher,
  transactions: database,
  clock,
  batchSize: env.OUTBOX_BATCH_SIZE,
  retryBackoff: {
    baseDelayMs: env.OUTBOX_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.OUTBOX_RETRY_MAX_DELAY_MS,
  },
});

const relayPendingEvents = async (): Promise<number> => {
  const report = await publishPendingEvents.execute();
  outboxMetrics.record(report);
  for (const rejection of report.rejected) {
    logger.warn(rejection, 'event rejected by the broker, retrying later');
  }
  return report.published;
};

const worker = new PollingWorker({
  name: 'outbox-relay',
  task: relayPendingEvents,
  idleDelayMs: env.OUTBOX_POLL_INTERVAL_MS,
  maxBackoffMs: env.OUTBOX_MAX_BACKOFF_MS,
  logger,
});

const healthServer = buildHealthServer({
  logger,
  healthIndicators: [
    new PostgresHealthIndicator(database),
    new RabbitMqHealthIndicator(connection),
  ],
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  await worker.stop();
  await healthServer.close();
  await publisher.close();
  await connection.close();
  await database.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

worker.start();
await healthServer.listen({ host: '0.0.0.0', port: env.PORT });

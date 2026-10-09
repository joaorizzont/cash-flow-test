import { parseArgs } from 'node:util';
import { pino } from 'pino';
import { RabbitMqDeadLetterRedriver } from './adapters/inbound/messaging/rabbitmq-dead-letter-redriver.js';
import { LEDGER_EVENTS_TOPOLOGY } from './adapters/outbound/messaging/consumer-topology.js';
import { RabbitMqConnection } from './adapters/outbound/messaging/rabbitmq-connection.js';
import { loadRedriveEnv } from './config/env.js';

const DEFAULT_LIMIT = 1_000;

const env = loadRedriveEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: 'daily-balance-redrive' } });

const { values } = parseArgs({ options: { limit: { type: 'string' } } });
const limit = Number(values.limit ?? DEFAULT_LIMIT);

if (!Number.isSafeInteger(limit) || limit <= 0) {
  logger.error('usage: redrive-dead-letters [--limit <positive integer>]');
  process.exit(1);
}

const connection = await RabbitMqConnection.open(env.RABBITMQ_URL, logger);

try {
  const redriver = new RabbitMqDeadLetterRedriver(connection, LEDGER_EVENTS_TOPOLOGY);
  const moved = await redriver.redrive(limit);
  logger.info({ moved, queue: LEDGER_EVENTS_TOPOLOGY.queue }, 'dead letters moved back');
} catch (error) {
  logger.error({ err: error }, 'failed to redrive dead letters');
  process.exitCode = 1;
} finally {
  await connection.close();
}

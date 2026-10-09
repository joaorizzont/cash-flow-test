import { parseArgs } from 'node:util';
import { pino } from 'pino';
import { createPool, PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { loadRebuildEnv } from './config/env.js';
import { createDailyBalanceUseCases } from './container.js';

const env = loadRebuildEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: 'daily-balance-rebuild' } });

const { values } = parseArgs({
  options: {
    merchant: { type: 'string' },
    date: { type: 'string' },
  },
});

if (values.merchant === undefined || values.date === undefined) {
  logger.error('usage: rebuild-day --merchant <merchant-id> --date <yyyy-mm-dd>');
  process.exit(1);
}

const database = new PostgresDatabase(
  createPool({ connectionString: env.DATABASE_URL, maxConnections: 1 }),
);

try {
  const { rebuildDailyBalance } = createDailyBalanceUseCases(database);
  const balance = await rebuildDailyBalance.execute({
    merchantId: values.merchant,
    businessDate: values.date,
  });
  logger.info({ balance }, 'daily balance rebuilt from the movement journal');
} catch (error) {
  logger.error({ err: error }, 'failed to rebuild the daily balance');
  process.exitCode = 1;
} finally {
  await database.close();
}

import { buildHttpServer } from './adapters/inbound/http/server.js';
import { ledgerMigrations } from './adapters/outbound/postgres/migrations/index.js';
import { createPool, PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresHealthIndicator } from './adapters/outbound/postgres/postgres-health-indicator.js';
import { PostgresMigrator } from './adapters/outbound/postgres/postgres-migrator.js';
import { loadEnv } from './config/env.js';
import { createLedgerApi } from './container.js';

const env = loadEnv();

const pool = createPool({
  connectionString: env.DATABASE_URL,
  maxConnections: env.DATABASE_POOL_SIZE,
});
await new PostgresMigrator(pool, ledgerMigrations).migrate();
const database = new PostgresDatabase(pool);

const server = await buildHttpServer({
  serviceName: env.SERVICE_NAME,
  logLevel: env.LOG_LEVEL,
  healthIndicators: [new PostgresHealthIndicator(database)],
  api: createLedgerApi({
    database,
    settings: {
      defaultTimeZone: env.DEFAULT_TIME_ZONE,
      maxBackdatedDays: env.MAX_BACKDATED_DAYS,
    },
  }),
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, 'shutting down');
  await server.close();
  await database.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

await server.listen({ host: '0.0.0.0', port: env.PORT });

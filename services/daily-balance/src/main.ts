import { pino } from 'pino';
import { buildHttpServer } from './adapters/inbound/http/server.js';
import { dailyBalanceMigrations } from './adapters/outbound/postgres/migrations/index.js';
import { createPool, PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresHealthIndicator } from './adapters/outbound/postgres/postgres-health-indicator.js';
import { PostgresMigrator } from './adapters/outbound/postgres/postgres-migrator.js';
import { RedisConnection } from './adapters/outbound/redis/redis-connection.js';
import { RedisHealthIndicator } from './adapters/outbound/redis/redis-health-indicator.js';
import { loadApiEnv } from './config/env.js';
import { createDailyBalanceApi } from './container.js';

const env = loadApiEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: env.SERVICE_NAME } });

const pool = createPool({
  connectionString: env.DATABASE_URL,
  maxConnections: env.DATABASE_POOL_SIZE,
  timeoutMs: env.DATABASE_TIMEOUT_MS,
  onIdleClientError: (error) => logger.warn({ err: error }, 'idle database connection lost'),
});
await new PostgresMigrator(pool, dailyBalanceMigrations).migrate();
const database = new PostgresDatabase(pool);
const redis = RedisConnection.open(env.REDIS_URL, logger);

const server = await buildHttpServer({
  logger,
  healthIndicators: [new PostgresHealthIndicator(database, false), new RedisHealthIndicator(redis)],
  api: createDailyBalanceApi({
    database,
    cacheClient: redis.client,
    logger,
    settings: {
      databaseTimeoutMs: env.DATABASE_TIMEOUT_MS,
      cacheFreshForMs: env.CACHE_FRESH_TTL_MS,
      cacheStaleTtlSeconds: env.CACHE_STALE_TTL_SECONDS,
      cacheTimeoutMs: env.CACHE_TIMEOUT_MS,
      circuitFailureThreshold: env.CIRCUIT_FAILURE_THRESHOLD,
      circuitResetTimeoutMs: env.CIRCUIT_RESET_TIMEOUT_MS,
    },
  }),
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  await server.close();
  await redis.close();
  await database.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

await server.listen({ host: '0.0.0.0', port: env.PORT });

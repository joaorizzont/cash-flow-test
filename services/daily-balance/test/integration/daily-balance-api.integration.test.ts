import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildHttpServer } from '../../src/adapters/inbound/http/server.js';
import {
  createPool,
  PostgresDatabase,
} from '../../src/adapters/outbound/postgres/postgres-database.js';
import { PostgresDailyBalanceReadModel } from '../../src/adapters/outbound/postgres/postgres-daily-balance-read-model.js';
import { RedisConnection } from '../../src/adapters/outbound/redis/redis-connection.js';
import { ReportPeriod, BusinessDate, MerchantId } from '../../src/domain/index.js';
import { createDailyBalanceApi, createDailyBalanceUseCases } from '../../src/container.js';
import { consolidateCommand, MERCHANT_ID, OTHER_MERCHANT_ID } from '../support/fixtures.js';
import { FixedClock } from '../support/fixed-clock.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';
import { waitUntil } from './support/wait-until.js';
import { createTestAuthority } from '../support/test-authority.js';

const silentLogger = pino({ level: 'silent' });
const authority = await createTestAuthority();
const headers = await authority.headersFor(MERCHANT_ID);
const SETTINGS = {
  databaseTimeoutMs: 1_000,
  cacheFreshForMs: 5_000,
  cacheStaleTtlSeconds: 60,
  cacheTimeoutMs: 200,
  circuitFailureThreshold: 3,
  circuitResetTimeoutMs: 10_000,
};

describe('daily balance API with PostgreSQL and Redis', () => {
  let testDatabase: TestDatabase;
  let redis: RedisConnection;
  let clock: FixedClock;
  const servers: FastifyInstance[] = [];

  const serverWith = async (database: PostgresDatabase, cacheRedis = redis) => {
    const server = await buildHttpServer({
      logger: silentLogger,
      healthIndicators: [],
      api: createDailyBalanceApi({
        database,
        cacheClient: cacheRedis.client,
        settings: SETTINGS,
        logger: silentLogger,
        clock,
      }),
      security: authority.security(),
    });
    servers.push(server);
    return server;
  };

  const consolidate = async (...commands: ReturnType<typeof consolidateCommand>[]) => {
    const { consolidateMovement } = createDailyBalanceUseCases(testDatabase.database);
    for (const command of commands) {
      await consolidateMovement.execute(command);
    }
  };

  const getDay = (server: FastifyInstance, date = '2026-10-09') =>
    server.inject({ method: 'GET', url: `/v1/daily-balances/${date}`, headers });

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    redis = RedisConnection.open(inject('redisUrl'), silentLogger);
    await waitUntil(async () => redis.isReady());
  });

  afterAll(async () => {
    await redis.close();
    await testDatabase.close();
  });

  beforeEach(async () => {
    clock = new FixedClock();
    await testDatabase.reset();
    await redis.client.flushAll();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('reads the consolidated balances accumulated by the consumer', async () => {
    await consolidate(
      consolidateCommand({ businessDate: '2026-10-08', amountInCents: 10_000 }),
      consolidateCommand({ businessDate: '2026-10-09', amountInCents: 2_000 }),
      consolidateCommand({ businessDate: '2026-10-09', entryType: 'DEBIT', amountInCents: 500 }),
      consolidateCommand({ merchantId: OTHER_MERCHANT_ID, amountInCents: 99_999 }),
    );
    const readModel = new PostgresDailyBalanceReadModel(testDatabase.database);
    const merchantId = MerchantId.from(MERCHANT_ID);

    const balances = await readModel.balancesIn(
      merchantId,
      ReportPeriod.parse('2026-10-01', '2026-10-31'),
    );
    const accumulated = await readModel.accumulatedBalanceBefore(
      merchantId,
      BusinessDate.from('2026-10-09'),
    );

    expect(balances.map((balance) => balance.businessDate.value)).toEqual([
      '2026-10-08',
      '2026-10-09',
    ]);
    expect(accumulated).toBe(10_000);
  });

  it('caches the report in redis after the first read', async () => {
    await consolidate(consolidateCommand({ amountInCents: 2_000 }));
    const server = await serverWith(testDatabase.database);

    const first = await getDay(server);
    const second = await getDay(server);

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.json()).toEqual(first.json());
    expect(await redis.client.keys('daily-balance:report:v1:*')).toHaveLength(1);
  });

  it('serves the last known report when the database is unavailable', async () => {
    await consolidate(consolidateCommand({ amountInCents: 2_000 }));
    const pool = createPool({ connectionString: inject('databaseUrl'), maxConnections: 2 });
    const failingDatabase = new PostgresDatabase(pool);
    const server = await serverWith(failingDatabase);
    await getDay(server);
    await failingDatabase.close();
    clock.advance(SETTINGS.cacheFreshForMs);

    const stale = await getDay(server);
    const missing = await getDay(server, '2026-10-01');

    expect(stale.statusCode).toBe(200);
    expect(stale.headers['x-cache']).toBe('STALE');
    expect(stale.json()).toMatchObject({ balanceInCents: 2_000 });
    expect(missing.statusCode).toBe(503);
  });

  it('keeps answering from the database when redis is unreachable', async () => {
    await consolidate(consolidateCommand({ amountInCents: 2_000 }));
    const unreachable = RedisConnection.open('redis://127.0.0.1:1', silentLogger);
    const server = await serverWith(testDatabase.database, unreachable);

    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => getDay(server)));
    await unreachable.close();

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(responses.every((response) => response.headers['x-cache'] === 'MISS')).toBe(true);
    expect(unreachable.isReady()).toBe(false);
  });
});

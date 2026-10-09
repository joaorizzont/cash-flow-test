import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../src/adapters/inbound/http/server.js';
import { PostgresHealthIndicator } from '../../src/adapters/outbound/postgres/postgres-health-indicator.js';
import { createLedgerApi } from '../../src/container.js';
import { MERCHANT_ID, NOW, POINT_OF_SALE_ID } from '../support/entry-fixtures.js';
import { FixedClock } from '../support/fixed-clock.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';
import { createTestAuthority } from '../support/test-authority.js';

const authority = await createTestAuthority();
const headers = await authority.headersFor(MERCHANT_ID);

describe('ledger HTTP API with PostgreSQL', () => {
  let testDatabase: TestDatabase;
  let server: FastifyInstance;

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    server = await buildHttpServer({
      serviceName: 'ledger',
      logLevel: 'silent',
      healthIndicators: [new PostgresHealthIndicator(testDatabase.database)],
      api: createLedgerApi({
        database: testDatabase.database,
        settings: { defaultTimeZone: 'America/Sao_Paulo', maxBackdatedDays: 30 },
        clock: new FixedClock(NOW),
      }),
      security: authority.security(),
    });
  });

  afterAll(async () => {
    await server.close();
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  it('records a sale at a point of sale and stores its event in the outbox', async () => {
    await server.inject({
      method: 'PUT',
      url: `/v1/points-of-sale/${POINT_OF_SALE_ID}`,
      headers,
      payload: { timeZone: 'America/Noronha' },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/entries',
      headers: { ...headers, 'idempotency-key': 'sale-1' },
      payload: {
        type: 'CREDIT',
        amountInCents: 15_990,
        description: 'Sale #1',
        pointOfSaleId: POINT_OF_SALE_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      timeZone: 'America/Noronha',
      recordedAtLocal: '2026-10-09T13:00:00-02:00',
    });
    expect(await testDatabase.count('entries')).toBe(1);
    expect(await testDatabase.count('outbox')).toBe(1);
  });

  it('stores a single entry when the same request is retried', async () => {
    const send = () =>
      server.inject({
        method: 'POST',
        url: '/v1/entries',
        headers: { ...headers, 'idempotency-key': 'sale-2' },
        payload: { type: 'DEBIT', amountInCents: 500, description: 'Coffee' },
      });

    const [first, second] = await Promise.all([send(), send()]);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(first.json()).toEqual(second.json());
    expect(await testDatabase.count('entries')).toBe(1);
    expect(await testDatabase.count('outbox')).toBe(1);
  });

  it('reverses an entry only once', async () => {
    const entry = (
      await server.inject({
        method: 'POST',
        url: '/v1/entries',
        headers,
        payload: { type: 'CREDIT', amountInCents: 1_000, description: 'Sale' },
      })
    ).json();
    const reverse = () =>
      server.inject({ method: 'POST', url: `/v1/entries/${entry.id}/reversal`, headers });

    const statuses = (await Promise.all([reverse(), reverse()])).map((r) => r.statusCode).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await testDatabase.count('entries')).toBe(2);
  });

  it('reports the database as ready', async () => {
    const response = await server.inject({ method: 'GET', url: '/health/ready' });

    expect(response.json()).toEqual({
      status: 'up',
      dependencies: [{ name: 'postgres', status: 'up' }],
    });
  });
});

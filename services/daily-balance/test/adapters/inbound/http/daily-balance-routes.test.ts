import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import {
  BalanceReportUnavailableError,
  CachedBalanceReport,
  GetBalanceReportService,
  type GetBalanceReport,
} from '../../../../src/application/index.js';
import { dailyBalance, MERCHANT_ID } from '../../../support/fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { InMemoryReadModel } from '../../../support/in-memory-read-model.js';
import { InMemoryReportCache } from '../../../support/in-memory-report-cache.js';
import { createTestAuthority } from '../../../support/test-authority.js';

const authority = await createTestAuthority();
const headers = await authority.headersFor(MERCHANT_ID);

describe('daily balance routes', () => {
  let server: FastifyInstance;
  let readModel: InMemoryReadModel;
  let clock: FixedClock;

  const buildServer = (getBalanceReport: GetBalanceReport = cachedReport()) =>
    buildHttpServer({
      logger: pino({ level: 'silent' }),
      healthIndicators: [],
      api: { getBalanceReport },
      security: authority.security(),
    });

  const cachedReport = () =>
    new CachedBalanceReport({
      origin: new GetBalanceReportService({ readModel, clock }),
      cache: new InMemoryReportCache(),
      clock,
      freshForMs: 5_000,
    });

  beforeEach(async () => {
    readModel = new InMemoryReadModel();
    clock = new FixedClock();
    readModel.add(
      dailyBalance('2026-10-08', { credits: 10_000, debits: 0, count: 2 }),
      dailyBalance('2026-10-09', { credits: 3_000, debits: 4_000, count: 3 }),
    );
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns the balance of a day with the accumulated balance', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/daily-balances/2026-10-09',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('MISS');
    expect(response.json()).toEqual({
      merchantId: MERCHANT_ID,
      businessDate: '2026-10-09',
      totalCreditsInCents: 3_000,
      totalDebitsInCents: 4_000,
      balanceInCents: -1_000,
      entryCount: 3,
      openingBalanceInCents: 10_000,
      closingBalanceInCents: 9_000,
      generatedAt: '2026-10-09T15:00:00.000Z',
    });
  });

  it('serves a repeated request from the cache', async () => {
    const request = { method: 'GET' as const, url: '/v1/daily-balances/2026-10-09', headers };

    await server.inject(request);
    const response = await server.inject(request);

    expect(response.headers['x-cache']).toBe('HIT');
  });

  it('returns a period report day by day', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/daily-balances?from=2026-10-07&to=2026-10-09',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from: '2026-10-07',
      to: '2026-10-09',
      openingBalanceInCents: 0,
      closingBalanceInCents: 9_000,
      netChangeInCents: 9_000,
      entryCount: 5,
    });
    expect(response.json().days).toHaveLength(3);
  });

  it.each([
    ['/v1/daily-balances/2026-13-01', headers],
    ['/v1/daily-balances?from=2026-10-09', headers],
    ['/v1/daily-balances?from=2026-10-09&to=2026-10-01', headers],
  ])('rejects %s with a problem', async (url, requestHeaders) => {
    const response = await server.inject({ method: 'GET', url, headers: requestHeaders });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('answers 503 with retry-after when the report is unavailable', async () => {
    await server.close();
    server = await buildServer({
      execute: async () => {
        throw new BalanceReportUnavailableError();
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/daily-balances/2026-10-09',
      headers,
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.json()).toMatchObject({ code: 'BALANCE_REPORT_UNAVAILABLE' });
  });

  it('marks a stale report served during a database outage', async () => {
    const request = { method: 'GET' as const, url: '/v1/daily-balances/2026-10-09', headers };
    await server.inject(request);
    clock.advance(60_000);
    readModel.failure = new Error('connection refused');

    const response = await server.inject(request);

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('STALE');
    expect(response.json()).toMatchObject({ balanceInCents: -1_000 });
  });

  it('documents the API', async () => {
    const response = await server.inject({ method: 'GET', url: '/docs/json' });

    expect(Object.keys(response.json().paths)).toEqual([
      '/v1/daily-balances/{businessDate}',
      '/v1/daily-balances',
    ]);
  });
});

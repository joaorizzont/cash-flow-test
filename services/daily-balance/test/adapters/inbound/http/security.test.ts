import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import { GetBalanceReportService } from '../../../../src/application/index.js';
import { dailyBalance, MERCHANT_ID, OTHER_MERCHANT_ID } from '../../../support/fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { InMemoryReadModel } from '../../../support/in-memory-read-model.js';
import { createTestAuthority } from '../../../support/test-authority.js';

const authority = await createTestAuthority();
const DAY_URL = '/v1/daily-balances/2026-10-09';

describe('HTTP security', () => {
  let server: FastifyInstance;

  const start = async (security = authority.security()) => {
    const readModel = new InMemoryReadModel();
    readModel.add(
      dailyBalance('2026-10-09', { credits: 1_000, debits: 0 }),
      dailyBalance('2026-10-09', { credits: 7_000, debits: 0 }, OTHER_MERCHANT_ID),
    );
    server = await buildHttpServer({
      logger: pino({ level: 'silent' }),
      healthIndicators: [],
      api: {
        getBalanceReport: new GetBalanceReportService({ readModel, clock: new FixedClock() }),
      },
      security,
    });
  };

  const getDay = (headers: Record<string, string>) =>
    server.inject({ method: 'GET', url: DAY_URL, headers });

  beforeEach(async () => {
    await start();
  });

  afterEach(async () => {
    await server.close();
  });

  it('requires a bearer token', async () => {
    const response = await getDay({});

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer realm="cash-flow"');
  });

  it('rejects an expired token', async () => {
    const response = await getDay(
      await authority.headersFor(MERCHANT_ID, { expiresInSeconds: -60 }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
  });

  it('forbids a token without the balance scope', async () => {
    const response = await getDay(
      await authority.headersFor(MERCHANT_ID, { scopes: ['ledger:read', 'ledger:write'] }),
    );

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('INSUFFICIENT_SCOPE');
  });

  it('only shows the balance of the merchant in the token', async () => {
    const response = await getDay({
      ...(await authority.headersFor(MERCHANT_ID)),
      'x-merchant-id': OTHER_MERCHANT_ID,
    });

    expect(response.json()).toMatchObject({ merchantId: MERCHANT_ID, balanceInCents: 1_000 });
  });

  it('limits requests per merchant', async () => {
    await server.close();
    await start(authority.security({ max: 1, timeWindowMs: 60_000 }));
    const headers = await authority.headersFor(MERCHANT_ID);

    const first = await getDay(headers);
    const second = await getDay(headers);

    expect([first.statusCode, second.statusCode]).toEqual([200, 429]);
    expect(second.json().code).toBe('RATE_LIMITED');
  });

  it('sends security headers', async () => {
    const response = await server.inject({ method: 'GET', url: '/health/live' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

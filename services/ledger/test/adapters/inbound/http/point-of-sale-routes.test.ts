import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import { MERCHANT_ID, NOW, POINT_OF_SALE_ID } from '../../../support/entry-fixtures.js';
import { createInMemoryLedger } from '../../../support/in-memory-ledger.js';

describe('point of sale routes', () => {
  let server: FastifyInstance;

  const configure = (timeZone: string) =>
    server.inject({
      method: 'PUT',
      url: `/v1/points-of-sale/${POINT_OF_SALE_ID}`,
      headers: { 'x-merchant-id': MERCHANT_ID },
      payload: { timeZone },
    });

  beforeEach(async () => {
    server = await buildHttpServer({
      serviceName: 'test',
      logLevel: 'silent',
      healthIndicators: [],
      api: createInMemoryLedger(NOW).api,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('configures the point of sale time zone', async () => {
    const response = await configure('america/manaus');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: POINT_OF_SALE_ID,
      merchantId: MERCHANT_ID,
      timeZone: 'America/Manaus',
    });
  });

  it('rejects an invalid time zone', async () => {
    const response = await configure('-04:00');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('records entries using the configured time zone', async () => {
    await configure('America/Manaus');

    const response = await server.inject({
      method: 'POST',
      url: '/v1/entries',
      headers: { 'x-merchant-id': MERCHANT_ID },
      payload: {
        type: 'CREDIT',
        amountInCents: 100,
        description: 'Sale',
        pointOfSaleId: POINT_OF_SALE_ID,
      },
    });

    expect(response.json()).toMatchObject({
      timeZone: 'America/Manaus',
      recordedAtLocal: '2026-10-09T11:00:00-04:00',
    });
  });
});

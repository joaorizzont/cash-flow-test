import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import type { LedgerApi } from '../../../../src/adapters/inbound/http/ledger-api.js';
import { MERCHANT_ID, NOW, OTHER_MERCHANT_ID, TODAY } from '../../../support/entry-fixtures.js';
import { createInMemoryLedger, type InMemoryLedger } from '../../../support/in-memory-ledger.js';
import { createTestAuthority } from '../../../support/test-authority.js';

const authority = await createTestAuthority();
const merchantHeaders = await authority.headersFor(MERCHANT_ID);
const saleBody = { type: 'CREDIT', amountInCents: 15_990, description: 'Sale #1024' };

const buildServer = (api: LedgerApi): Promise<FastifyInstance> =>
  buildHttpServer({
    serviceName: 'test',
    logLevel: 'silent',
    healthIndicators: [],
    api,
    security: authority.security(),
  });

describe('entry routes', () => {
  let ledger: InMemoryLedger;
  let server: FastifyInstance;

  const recordSale = (headers: Record<string, string> = {}, body: object = saleBody) =>
    server.inject({
      method: 'POST',
      url: '/v1/entries',
      headers: { ...merchantHeaders, ...headers },
      payload: body,
    });

  beforeEach(async () => {
    ledger = createInMemoryLedger(NOW);
    server = await buildServer(ledger.api);
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /v1/entries', () => {
    it('records an entry and points to it', async () => {
      const response = await recordSale();

      expect(response.statusCode).toBe(201);
      expect(response.headers.location).toBe(`/v1/entries/${response.json().id}`);
      expect(response.headers['idempotent-replayed']).toBe('false');
      expect(response.json()).toMatchObject({
        merchantId: MERCHANT_ID,
        type: 'CREDIT',
        amountInCents: 15_990,
        businessDate: TODAY,
        timeZone: 'America/Sao_Paulo',
      });
    });

    it('replays the original response for a repeated idempotency key', async () => {
      const first = await recordSale({ 'idempotency-key': 'sale-1024' });
      const reordered = { description: 'Sale #1024', amountInCents: 15_990, type: 'CREDIT' };

      const retry = await recordSale({ 'idempotency-key': 'sale-1024' }, reordered);

      expect(retry.statusCode).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.json()).toEqual(first.json());
      expect(ledger.entries.all()).toHaveLength(1);
    });

    it('rejects reusing an idempotency key with a different request', async () => {
      await recordSale({ 'idempotency-key': 'sale-1024' });

      const response = await recordSale(
        { 'idempotency-key': 'sale-1024' },
        { ...saleBody, amountInCents: 1 },
      );

      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it.each([
      [{ ...saleBody, amountInCents: 0 }, 'body/amountInCents must be >= 1'],
      [{ ...saleBody, type: 'TRANSFER' }, 'body/type'],
      [{ ...saleBody, extra: true }, 'body must NOT have additional properties'],
      [{ type: 'CREDIT', amountInCents: 10 }, "body must have required property 'description'"],
    ])('responds with a validation problem for %j', async (body, detail) => {
      const response = await recordSale({}, body);

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(response.json().detail).toContain(detail);
    });

    it('maps business rule violations to 422', async () => {
      const response = await recordSale({}, { ...saleBody, businessDate: '2030-01-01' });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        title: 'Unprocessable Entity',
        code: 'BUSINESS_DATE_OUT_OF_RANGE',
      });
    });
  });

  describe('POST /v1/entries/:entryId/reversal', () => {
    it('reverses an entry without a request body', async () => {
      const entry = (await recordSale()).json();

      const response = await server.inject({
        method: 'POST',
        url: `/v1/entries/${entry.id}/reversal`,
        headers: merchantHeaders,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ type: 'DEBIT', reversalOf: entry.id });
    });

    it('responds with conflict when the entry was already reversed', async () => {
      const entry = (await recordSale()).json();
      const reverse = () =>
        server.inject({
          method: 'POST',
          url: `/v1/entries/${entry.id}/reversal`,
          headers: merchantHeaders,
          payload: { reason: 'Duplicated sale' },
        });
      await reverse();

      const response = await reverse();

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ENTRY_ALREADY_REVERSED');
    });
  });

  describe('GET /v1/entries/:entryId', () => {
    it('returns the entry of the merchant', async () => {
      const entry = (await recordSale()).json();

      const response = await server.inject({
        method: 'GET',
        url: `/v1/entries/${entry.id}`,
        headers: merchantHeaders,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(entry);
    });

    it('hides entries of other merchants', async () => {
      const entry = (await recordSale()).json();

      const response = await server.inject({
        method: 'GET',
        url: `/v1/entries/${entry.id}`,
        headers: await authority.headersFor(OTHER_MERCHANT_ID),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ENTRY_NOT_FOUND');
    });
  });

  describe('GET /v1/entries', () => {
    it('lists entries with coerced pagination parameters', async () => {
      await recordSale();
      await recordSale();

      const response = await server.inject({
        method: 'GET',
        url: `/v1/entries?from=${TODAY}&to=${TODAY}&page=2&pageSize=1`,
        headers: merchantHeaders,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ page: 2, pageSize: 1, total: 2 });
      expect(response.json().items).toHaveLength(1);
    });

    it('requires the period', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/entries',
        headers: merchantHeaders,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  it('responds with a problem for unknown routes', async () => {
    const response = await server.inject({ method: 'GET', url: '/v2/unknown' });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ROUTE_NOT_FOUND');
  });

  it('hides internal error details', async () => {
    await server.close();
    const failing: LedgerApi = {
      ...ledger.api,
      listEntries: {
        execute: async () => {
          throw new Error('connection terminated');
        },
      },
    };
    server = await buildServer(failing);

    const response = await server.inject({
      method: 'GET',
      url: `/v1/entries?from=${TODAY}&to=${TODAY}`,
      headers: merchantHeaders,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred',
    });
  });

  it('serves the OpenAPI document', async () => {
    const response = await server.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toEqual(
      expect.arrayContaining(['/v1/entries', '/v1/entries/{entryId}/reversal']),
    );
  });
});

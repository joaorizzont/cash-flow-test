import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import { AuthenticationUnavailableError } from '../../../../src/adapters/inbound/http/security/token-verifier.js';
import { MERCHANT_ID, NOW, OTHER_MERCHANT_ID, TODAY } from '../../../support/entry-fixtures.js';
import { createInMemoryLedger } from '../../../support/in-memory-ledger.js';
import { createTestAuthority, type TokenClaims } from '../../../support/test-authority.js';

const authority = await createTestAuthority();
const otherAuthority = await createTestAuthority();
const saleBody = { type: 'CREDIT', amountInCents: 1_000, description: 'Sale' };
const listUrl = `/v1/entries?from=${TODAY}&to=${TODAY}`;

describe('HTTP security', () => {
  let server: FastifyInstance;

  const start = async (security = authority.security()) => {
    server = await buildHttpServer({
      serviceName: 'test',
      logLevel: 'silent',
      healthIndicators: [],
      api: createInMemoryLedger(NOW).api,
      security,
    });
  };

  const record = (headers: Record<string, string>) =>
    server.inject({ method: 'POST', url: '/v1/entries', headers, payload: saleBody });

  const withToken = async (claims: TokenClaims) => authority.headersFor(MERCHANT_ID, claims);

  beforeEach(async () => {
    await start();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('authentication', () => {
    it('requires a bearer token and challenges the client', async () => {
      const response = await record({});

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer realm="cash-flow"');
      expect(response.json()).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    });

    it.each<[string, () => Promise<Record<string, string>>]>([
      ['a token signed by another key', () => otherAuthority.headersFor(MERCHANT_ID)],
      ['an expired token', () => withToken({ expiresInSeconds: -60 })],
      ['a token for another audience', () => withToken({ audience: 'account' })],
      ['a token from another issuer', () => withToken({ issuer: 'https://evil.test' })],
      ['a token without merchant', () => withToken({ merchantId: null })],
      ['a token with an invalid merchant', () => withToken({ merchantId: 'merchant-1' })],
      ['a malformed token', async () => ({ authorization: 'Bearer not-a-jwt' })],
      ['another authentication scheme', async () => ({ authorization: 'Basic dXNlcjpwYXNz' })],
    ])('rejects %s', async (_case, headers) => {
      const response = await record(await headers());

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('UNAUTHORIZED');
    });

    it('answers 503 when the token cannot be verified', async () => {
      await server.close();
      await start({
        verifier: {
          verify: async () => {
            throw new AuthenticationUnavailableError(new Error('jwks unreachable'));
          },
        },
        rateLimit: { max: 100, timeWindowMs: 60_000 },
      });

      const response = await record(await authority.headersFor(MERCHANT_ID));

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('AUTHENTICATION_UNAVAILABLE');
    });

    it('keeps health checks and documentation public', async () => {
      const responses = await Promise.all(
        ['/health/live', '/docs/json'].map((url) => server.inject({ method: 'GET', url })),
      );

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    });
  });

  describe('authorization', () => {
    it('forbids writing with a read only token', async () => {
      const response = await record(await withToken({ scopes: ['ledger:read'] }));

      expect(response.statusCode).toBe(403);
      expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"');
      expect(response.json().code).toBe('INSUFFICIENT_SCOPE');
    });

    it('allows reading with a read only token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: listUrl,
        headers: await withToken({ scopes: ['ledger:read'] }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('takes the merchant from the token and ignores a spoofed header', async () => {
      const response = await record({
        ...(await authority.headersFor(MERCHANT_ID)),
        'x-merchant-id': OTHER_MERCHANT_ID,
      });

      expect(response.json().merchantId).toBe(MERCHANT_ID);
    });
  });

  describe('rate limiting', () => {
    it('limits each merchant independently', async () => {
      await server.close();
      await start(authority.security({ max: 2, timeWindowMs: 60_000 }));
      const merchant = await authority.headersFor(MERCHANT_ID);
      const other = await authority.headersFor(OTHER_MERCHANT_ID);

      const statuses = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        statuses.push((await record(merchant)).statusCode);
      }
      const limited = await record(merchant);
      const otherMerchant = await record(other);

      expect(statuses).toEqual([201, 201, 429]);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.json()).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
      expect(otherMerchant.statusCode).toBe(201);
    });

    it('does not limit health checks', async () => {
      await server.close();
      await start(authority.security({ max: 1, timeWindowMs: 60_000 }));

      const responses = await Promise.all(
        [1, 2, 3].map(() => server.inject({ method: 'GET', url: '/health/live' })),
      );

      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    });
  });

  describe('hardening', () => {
    it('sends security headers', async () => {
      const response = await server.inject({ method: 'GET', url: '/health/live' });

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'strict-transport-security': expect.stringContaining('max-age='),
      });
    });

    it('rejects oversized bodies', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/entries',
        headers: await authority.headersFor(MERCHANT_ID),
        payload: { ...saleBody, description: 'x'.repeat(20_000) },
      });

      expect(response.statusCode).toBe(413);
    });

    it('serves the documentation without forcing https upgrades', async () => {
      const response = await server.inject({ method: 'GET', url: '/docs/' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    });

    it('documents the bearer security scheme', async () => {
      const response = await server.inject({ method: 'GET', url: '/docs/json' });

      expect(response.json().components.securitySchemes.bearerAuth).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });
  });
});

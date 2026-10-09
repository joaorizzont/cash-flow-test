import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JoseTokenVerifier } from '../../src/adapters/inbound/http/security/jose-token-verifier.js';
import { buildHttpServer } from '../../src/adapters/inbound/http/server.js';
import { createLedgerApi } from '../../src/container.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

const REALM_FILE = fileURLToPath(
  new URL('../../../../infra/keycloak/cash-flow-realm.json', import.meta.url),
);
const CENTRO = '6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f';
const NORTE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('Keycloak realm and token validation', () => {
  let keycloak: StartedTestContainer;
  let realmUrl: string;
  let verifier: JoseTokenVerifier;
  let testDatabase: TestDatabase;
  let server: FastifyInstance;

  const tokenOf = async (username: string): Promise<string> => {
    const response = await fetch(`${realmUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'cash-flow-app',
        username,
        password: 'cashflow',
      }),
    });
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  };

  const bearer = async (username: string) => ({
    authorization: `Bearer ${await tokenOf(username)}`,
  });

  beforeAll(async () => {
    keycloak = await new GenericContainer('quay.io/keycloak/keycloak:26.4')
      .withEnvironment({
        KC_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        KC_BOOTSTRAP_ADMIN_PASSWORD: 'admin',
      })
      .withCopyFilesToContainer([
        { source: REALM_FILE, target: '/opt/keycloak/data/import/cash-flow-realm.json' },
      ])
      .withCommand(['start-dev', '--import-realm'])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp('/realms/cash-flow', 8080).withStartupTimeout(120_000))
      .start();
    realmUrl = `http://${keycloak.getHost()}:${keycloak.getMappedPort(8080)}/realms/cash-flow`;
    verifier = JoseTokenVerifier.remote({
      issuer: realmUrl,
      audience: 'cash-flow-api',
      jwksUrl: `${realmUrl}/protocol/openid-connect/certs`,
    });
    testDatabase = await connectTestDatabase();
    server = await buildHttpServer({
      serviceName: 'ledger',
      logLevel: 'silent',
      healthIndicators: [],
      api: createLedgerApi({
        database: testDatabase.database,
        settings: { defaultTimeZone: 'America/Sao_Paulo', maxBackdatedDays: 30 },
      }),
      security: { verifier, rateLimit: { max: 1_000, timeWindowMs: 60_000 } },
    });
  });

  afterAll(async () => {
    await server.close();
    await testDatabase.close();
    await keycloak.stop();
  });

  it('issues tokens that carry the merchant and the scopes of the role', async () => {
    const operator = await verifier.verify(await tokenOf('operador.centro'));
    const viewer = await verifier.verify(await tokenOf('analista.centro'));
    const otherMerchant = await verifier.verify(await tokenOf('operador.norte'));

    expect(operator.merchantId).toBe(CENTRO);
    expect([...operator.scopes].sort()).toEqual(['balance:read', 'ledger:read', 'ledger:write']);
    expect(viewer.merchantId).toBe(CENTRO);
    expect([...viewer.scopes].sort()).toEqual(['balance:read', 'ledger:read']);
    expect(otherMerchant.merchantId).toBe(NORTE);
  });

  it('lets an operator record entries and a viewer only read them', async () => {
    const sale = { type: 'CREDIT', amountInCents: 1_000, description: 'Sale' };

    const recorded = await server.inject({
      method: 'POST',
      url: '/v1/entries',
      headers: await bearer('operador.centro'),
      payload: sale,
    });
    const forbidden = await server.inject({
      method: 'POST',
      url: '/v1/entries',
      headers: await bearer('analista.centro'),
      payload: sale,
    });
    const read = await server.inject({
      method: 'GET',
      url: `/v1/entries/${recorded.json().id}`,
      headers: await bearer('analista.centro'),
    });
    const isolated = await server.inject({
      method: 'GET',
      url: `/v1/entries/${recorded.json().id}`,
      headers: await bearer('operador.norte'),
    });

    expect(recorded.statusCode).toBe(201);
    expect(recorded.json().merchantId).toBe(CENTRO);
    expect(forbidden.statusCode).toBe(403);
    expect(read.statusCode).toBe(200);
    expect(isolated.statusCode).toBe(404);
  });
});

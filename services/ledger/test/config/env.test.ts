import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadRelayEnv } from '../../src/config/env.js';

const DATABASE_URL = 'postgres://user:secret@localhost:5432/ledger';
const RABBITMQ_URL = 'amqp://user:secret@localhost:5672';
const AUTH = {
  AUTH_ISSUER: 'http://localhost:8080/realms/cash-flow',
  AUTH_JWKS_URL: 'http://keycloak:8080/realms/cash-flow/protocol/openid-connect/certs',
};

describe('loadApiEnv', () => {
  it('applies defaults', () => {
    expect(loadApiEnv({ DATABASE_URL, ...AUTH })).toEqual({
      NODE_ENV: 'development',
      SERVICE_NAME: 'ledger',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
      DEFAULT_TIME_ZONE: 'America/Sao_Paulo',
      MAX_BACKDATED_DAYS: 30,
      ...AUTH,
      AUTH_AUDIENCE: 'cash-flow-api',
      RATE_LIMIT_MAX: 1_200,
      RATE_LIMIT_WINDOW_MS: 60_000,
    });
  });

  it('coerces numbers from strings', () => {
    const env = loadApiEnv({ DATABASE_URL, ...AUTH, PORT: '8080', DATABASE_POOL_SIZE: '20' });

    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_POOL_SIZE).toBe(20);
  });

  it('requires the database url', () => {
    expect(() => loadApiEnv({ ...AUTH })).toThrow();
  });

  it('requires the token issuer and keys', () => {
    expect(() => loadApiEnv({ DATABASE_URL })).toThrow();
    expect(() => loadApiEnv({ DATABASE_URL, ...AUTH, AUTH_ISSUER: 'not a url' })).toThrow();
  });

  it('rejects an invalid log level', () => {
    expect(() => loadApiEnv({ DATABASE_URL, ...AUTH, LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('loadRelayEnv', () => {
  it('applies defaults', () => {
    expect(loadRelayEnv({ DATABASE_URL, RABBITMQ_URL })).toMatchObject({
      SERVICE_NAME: 'ledger-outbox-relay',
      RABBITMQ_URL,
      OUTBOX_BATCH_SIZE: 100,
      OUTBOX_POLL_INTERVAL_MS: 500,
      OUTBOX_MAX_BACKOFF_MS: 30_000,
      OUTBOX_RETRY_BASE_DELAY_MS: 1_000,
      OUTBOX_RETRY_MAX_DELAY_MS: 300_000,
    });
  });

  it('requires the rabbitmq url', () => {
    expect(() => loadRelayEnv({ DATABASE_URL })).toThrow();
  });

  it('limits the batch size', () => {
    expect(() => loadRelayEnv({ DATABASE_URL, RABBITMQ_URL, OUTBOX_BATCH_SIZE: '5000' })).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  loadApiEnv,
  loadConsumerEnv,
  loadRebuildEnv,
  loadRedriveEnv,
} from '../../src/config/env.js';

const DATABASE_URL = 'postgres://user:secret@localhost:5433/daily_balance';
const RABBITMQ_URL = 'amqp://user:secret@localhost:5672';
const REDIS_URL = 'redis://localhost:6379';
const AUTH = {
  AUTH_ISSUER: 'http://localhost:8080/realms/cash-flow',
  AUTH_JWKS_URL: 'http://keycloak:8080/realms/cash-flow/protocol/openid-connect/certs',
};

describe('loadApiEnv', () => {
  it('applies defaults', () => {
    expect(loadApiEnv({ DATABASE_URL, REDIS_URL, ...AUTH })).toEqual({
      NODE_ENV: 'development',
      SERVICE_NAME: 'daily-balance',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
      REDIS_URL,
      DATABASE_TIMEOUT_MS: 2_000,
      CACHE_FRESH_TTL_MS: 5_000,
      CACHE_STALE_TTL_SECONDS: 86_400,
      CACHE_TIMEOUT_MS: 100,
      CIRCUIT_FAILURE_THRESHOLD: 5,
      CIRCUIT_RESET_TIMEOUT_MS: 10_000,
      ...AUTH,
      AUTH_AUDIENCE: 'cash-flow-api',
      RATE_LIMIT_MAX: 1_200,
      RATE_LIMIT_WINDOW_MS: 60_000,
    });
  });

  it('coerces the port from string', () => {
    expect(loadApiEnv({ DATABASE_URL, REDIS_URL, ...AUTH, PORT: '8080' }).PORT).toBe(8080);
  });

  it('requires the database and redis urls', () => {
    expect(() => loadApiEnv({ REDIS_URL, ...AUTH })).toThrow();
    expect(() => loadApiEnv({ DATABASE_URL, ...AUTH })).toThrow();
    expect(() => loadApiEnv({ DATABASE_URL, REDIS_URL })).toThrow();
  });

  it('rejects an invalid log level', () => {
    expect(() => loadApiEnv({ DATABASE_URL, REDIS_URL, ...AUTH, LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('loadConsumerEnv', () => {
  it('applies defaults', () => {
    expect(loadConsumerEnv({ DATABASE_URL, RABBITMQ_URL })).toMatchObject({
      SERVICE_NAME: 'daily-balance-consumer',
      RABBITMQ_URL,
      CONSUMER_PREFETCH: 20,
      CONSUMER_MAX_ATTEMPTS: 5,
      CONSUMER_RETRY_DELAY_MS: 10_000,
    });
  });

  it('requires the rabbitmq url', () => {
    expect(() => loadConsumerEnv({ DATABASE_URL })).toThrow();
  });

  it('limits the prefetch', () => {
    expect(() =>
      loadConsumerEnv({ DATABASE_URL, RABBITMQ_URL, CONSUMER_PREFETCH: '5000' }),
    ).toThrow();
  });
});

describe('command line environments', () => {
  it('requires only the database for a rebuild', () => {
    expect(loadRebuildEnv({ DATABASE_URL })).toMatchObject({ DATABASE_URL, LOG_LEVEL: 'info' });
  });

  it('requires only rabbitmq for a redrive', () => {
    expect(loadRedriveEnv({ RABBITMQ_URL })).toEqual({ RABBITMQ_URL, LOG_LEVEL: 'info' });
  });
});

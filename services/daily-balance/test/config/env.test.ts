import { describe, expect, it } from 'vitest';
import {
  loadApiEnv,
  loadConsumerEnv,
  loadRebuildEnv,
  loadRedriveEnv,
} from '../../src/config/env.js';

const DATABASE_URL = 'postgres://user:secret@localhost:5433/daily_balance';
const RABBITMQ_URL = 'amqp://user:secret@localhost:5672';

describe('loadApiEnv', () => {
  it('applies defaults', () => {
    expect(loadApiEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      SERVICE_NAME: 'daily-balance',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
    });
  });

  it('coerces the port from string', () => {
    expect(loadApiEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('requires the database url', () => {
    expect(() => loadApiEnv({})).toThrow();
  });

  it('rejects an invalid log level', () => {
    expect(() => loadApiEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow();
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

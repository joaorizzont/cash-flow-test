import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadRelayEnv } from '../../src/config/env.js';

const DATABASE_URL = 'postgres://user:secret@localhost:5432/ledger';
const RABBITMQ_URL = 'amqp://user:secret@localhost:5672';

describe('loadApiEnv', () => {
  it('applies defaults', () => {
    expect(loadApiEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      SERVICE_NAME: 'ledger',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
      DEFAULT_TIME_ZONE: 'America/Sao_Paulo',
      MAX_BACKDATED_DAYS: 30,
    });
  });

  it('coerces numbers from strings', () => {
    const env = loadApiEnv({ DATABASE_URL, PORT: '8080', DATABASE_POOL_SIZE: '20' });

    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_POOL_SIZE).toBe(20);
  });

  it('requires the database url', () => {
    expect(() => loadApiEnv({})).toThrow();
  });

  it('rejects an invalid log level', () => {
    expect(() => loadApiEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow();
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

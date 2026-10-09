import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const DATABASE_URL = 'postgres://user:secret@localhost:5432/ledger';

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv({ DATABASE_URL })).toEqual({
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
    const env = loadEnv({ DATABASE_URL, PORT: '8080', DATABASE_POOL_SIZE: '20' });

    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_POOL_SIZE).toBe(20);
  });

  it('requires the database url', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('rejects an invalid log level', () => {
    expect(() => loadEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow();
  });
});

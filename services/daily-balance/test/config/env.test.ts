import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      SERVICE_NAME: 'daily-balance',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('coerces the port from string', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects an invalid log level', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  RedisBalanceReportCache,
  type KeyValueClient,
} from '../../../../src/adapters/outbound/redis/redis-balance-report-cache.js';
import { CircuitBreaker } from '../../../../src/adapters/outbound/resilience/circuit-breaker.js';
import type { CachedReportEntry } from '../../../../src/application/index.js';
import { FixedClock } from '../../../support/fixed-clock.js';

const ENTRY = {
  report: { merchantId: 'm' },
  cachedAt: '2026-10-09T15:00:00.000Z',
} as unknown as CachedReportEntry;

const setup = (client: KeyValueClient) => {
  const logger = { warn: vi.fn() };
  const cache = new RedisBalanceReportCache({
    client,
    breaker: new CircuitBreaker({
      name: 'redis',
      failureThreshold: 2,
      resetTimeoutMs: 10_000,
      callTimeoutMs: 50,
      clock: new FixedClock(),
    }),
    ttlSeconds: 60,
    logger,
  });
  return { cache, logger };
};

describe('RedisBalanceReportCache', () => {
  it('stores entries as JSON with the stale TTL and reads them back', async () => {
    const store = new Map<string, string>();
    const set = vi.fn(async (key: string, value: string) => store.set(key, value));
    const { cache } = setup({ get: async (key) => store.get(key) ?? null, set });

    await cache.set('key', ENTRY);

    expect(set).toHaveBeenCalledWith('key', JSON.stringify(ENTRY), { EX: 60 });
    expect(await cache.get('key')).toEqual(ENTRY);
    expect(await cache.get('missing')).toBeNull();
  });

  it('treats a failing redis as a miss and stops calling it once the circuit opens', async () => {
    const get = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const { cache, logger } = setup({ get, set: async () => 'OK' });

    const results = [await cache.get('key'), await cache.get('key'), await cache.get('key')];

    expect(results).toEqual([null, null, null]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('ignores write failures', async () => {
    const { cache } = setup({
      get: async () => null,
      set: async () => {
        throw new Error('read only replica');
      },
    });

    await expect(cache.set('key', ENTRY)).resolves.toBeUndefined();
  });
});

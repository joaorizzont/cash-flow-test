import { beforeEach, describe, expect, it } from 'vitest';
import {
  BalanceReportUnavailableError,
  CachedBalanceReport,
  GetBalanceReportService,
} from '../../../src/application/index.js';
import { ValidationError } from '../../../src/domain/index.js';
import { dailyBalance, MERCHANT_ID } from '../../support/fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryReadModel } from '../../support/in-memory-read-model.js';
import { InMemoryReportCache } from '../../support/in-memory-report-cache.js';

const FRESH_FOR_MS = 5_000;
const QUERY = { merchantId: MERCHANT_ID, from: '2026-10-09', to: '2026-10-09' };

describe('CachedBalanceReport', () => {
  let clock: FixedClock;
  let readModel: InMemoryReadModel;
  let cache: InMemoryReportCache;
  let service: CachedBalanceReport;

  const balanceOf = async (): Promise<number | undefined> =>
    (await service.execute(QUERY)).report.days[0]?.balanceInCents;

  beforeEach(() => {
    clock = new FixedClock();
    readModel = new InMemoryReadModel();
    cache = new InMemoryReportCache();
    service = new CachedBalanceReport({
      origin: new GetBalanceReportService({ readModel, clock }),
      cache,
      clock,
      freshForMs: FRESH_FOR_MS,
    });
    readModel.add(dailyBalance('2026-10-09', { credits: 1_000, debits: 0 }));
  });

  it('reads from the database on a miss and stores the report', async () => {
    const result = await service.execute(QUERY);

    expect(result.source).toBe('DATABASE');
    expect([...cache.entries.keys()]).toEqual([
      `daily-balance:report:v1:${MERCHANT_ID}:2026-10-09:2026-10-09`,
    ]);
  });

  it('serves a fresh report from the cache', async () => {
    await service.execute(QUERY);
    clock.advance(FRESH_FOR_MS - 1);

    const result = await service.execute(QUERY);

    expect(result.source).toBe('CACHE');
    expect(readModel.reads).toBe(2);
  });

  it('refreshes an expired report from the database', async () => {
    await service.execute(QUERY);
    readModel.add(dailyBalance('2026-10-09', { credits: 500, debits: 0 }, MERCHANT_ID));
    clock.advance(FRESH_FOR_MS);

    const result = await service.execute(QUERY);

    expect(result.source).toBe('DATABASE');
  });

  it('serves the last known report when the database fails', async () => {
    await service.execute(QUERY);
    clock.advance(FRESH_FOR_MS * 10);
    readModel.failure = new Error('connection refused');

    const result = await service.execute(QUERY);

    expect(result.source).toBe('STALE_CACHE');
    expect(await balanceOf()).toBe(1_000);
  });

  it('reports unavailability when the database fails and nothing is cached', async () => {
    readModel.failure = new Error('connection refused');

    await expect(service.execute(QUERY)).rejects.toThrow(BalanceReportUnavailableError);
  });

  it('keeps validation errors as they are', async () => {
    await expect(service.execute({ ...QUERY, from: '2026-10-10' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('shares a single database read between concurrent identical requests', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => service.execute(QUERY)));

    expect(results.every((result) => result.source === 'DATABASE')).toBe(true);
    expect(readModel.reads).toBe(2);
  });

  it('normalizes the merchant id in the cache key', async () => {
    await service.execute(QUERY);

    const result = await service.execute({ ...QUERY, merchantId: MERCHANT_ID.toUpperCase() });

    expect(result.source).toBe('CACHE');
  });
});

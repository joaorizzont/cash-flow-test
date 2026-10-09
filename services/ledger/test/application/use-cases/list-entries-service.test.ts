import { beforeEach, describe, expect, it } from 'vitest';
import { ListEntriesService, MAX_PAGE_SIZE } from '../../../src/application/index.js';
import { BusinessDate, EntryId, MerchantId, ValidationError } from '../../../src/domain/index.js';
import { MERCHANT_ID, OTHER_MERCHANT_ID, recordedEntry } from '../../support/entry-fixtures.js';
import { InMemoryEntryRepository } from '../../support/in-memory-entry-repository.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

describe('ListEntriesService', () => {
  let service: ListEntriesService;

  beforeEach(async () => {
    const repository = new InMemoryEntryRepository();
    const ids = new SequentialIdGenerator();
    const seed = [
      { merchantId: MERCHANT_ID, businessDate: '2026-10-03' },
      { merchantId: MERCHANT_ID, businessDate: '2026-10-01' },
      { merchantId: MERCHANT_ID, businessDate: '2026-10-02' },
      { merchantId: MERCHANT_ID, businessDate: '2026-09-30' },
      { merchantId: OTHER_MERCHANT_ID, businessDate: '2026-10-02' },
    ];
    for (const { merchantId, businessDate } of seed) {
      await repository.save(
        recordedEntry({
          id: EntryId.from(ids.next()),
          merchantId: MerchantId.from(merchantId),
          businessDate: BusinessDate.from(businessDate),
        }),
      );
    }
    service = new ListEntriesService(repository);
  });

  it('lists only the merchant entries within the period, ordered by business date', async () => {
    const result = await service.execute({
      merchantId: MERCHANT_ID,
      from: '2026-10-01',
      to: '2026-10-03',
    });

    expect(result.items.map((item) => item.businessDate)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(result).toMatchObject({ page: 1, pageSize: 50, total: 3 });
  });

  it('paginates the result', async () => {
    const result = await service.execute({
      merchantId: MERCHANT_ID,
      from: '2026-09-01',
      to: '2026-10-31',
      page: 2,
      pageSize: 3,
    });

    expect(result.items.map((item) => item.businessDate)).toEqual(['2026-10-03']);
    expect(result.total).toBe(4);
  });

  it.each([
    { from: '2026-10-05', to: '2026-10-01' },
    { from: '2026-01-01', to: '2026-10-01' },
    { page: 0 },
    { pageSize: MAX_PAGE_SIZE + 1 },
    { pageSize: 2.5 },
  ])('rejects invalid query %j', async (overrides) => {
    await expect(
      service.execute({
        merchantId: MERCHANT_ID,
        from: '2026-10-01',
        to: '2026-10-03',
        ...overrides,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

import { isLedgerEventV1 } from '@cash-flow/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxWriter } from '../../src/adapters/outbound/postgres/outbox-writer.js';
import { PostgresEntryRepository } from '../../src/adapters/outbound/postgres/postgres-entry-repository.js';
import { PostgresPointOfSaleRepository } from '../../src/adapters/outbound/postgres/postgres-point-of-sale-repository.js';
import { EntryAlreadyReversedError, toEntryView } from '../../src/application/index.js';
import {
  BusinessDate,
  Description,
  EntryId,
  EntryType,
  MerchantId,
  PointOfSaleId,
  type Entry,
} from '../../src/domain/index.js';
import {
  ENTRY_ID,
  MERCHANT_ID,
  OTHER_MERCHANT_ID,
  POINT_OF_SALE_ID,
  pointOfSaleIn,
  recordedEntry,
} from '../support/entry-fixtures.js';
import { SequentialIdGenerator } from '../support/sequential-id-generator.js';
import { NORONHA } from '../support/time-zones.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

const merchant = MerchantId.from(MERCHANT_ID);

describe('PostgresEntryRepository', () => {
  let testDatabase: TestDatabase;
  let repository: PostgresEntryRepository;
  let ids: SequentialIdGenerator;

  const reversalOf = (entry: Entry): Entry =>
    entry.reverse({
      id: EntryId.from(ids.next()),
      description: Description.from('Refund'),
      recordedAt: new Date('2026-10-09T18:00:00.000Z'),
    });

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
    ids = new SequentialIdGenerator();
    repository = new PostgresEntryRepository(
      testDatabase.database,
      new OutboxWriter(testDatabase.database, new SequentialIdGenerator()),
    );
  });

  it('persists and restores an entry with every attribute', async () => {
    await new PostgresPointOfSaleRepository(testDatabase.database).save(pointOfSaleIn(NORONHA));
    const entry = recordedEntry({
      pointOfSaleId: PointOfSaleId.from(POINT_OF_SALE_ID),
      timeZone: NORONHA,
      type: EntryType.DEBIT,
    });

    await repository.save(entry);
    const restored = await repository.findById(merchant, EntryId.from(ENTRY_ID));

    expect(restored).not.toBeNull();
    expect(toEntryView(restored as Entry)).toEqual(toEntryView(entry));
  });

  it('writes the domain event to the outbox as a v1 contract event with the entry', async () => {
    await repository.save(recordedEntry());

    const result = await testDatabase.pool.query(
      'SELECT id, aggregate_id, event_type, payload, published_at FROM outbox',
    );
    const [row] = result.rows;

    expect(result.rows).toHaveLength(1);
    expect(row).toMatchObject({
      aggregate_id: ENTRY_ID,
      event_type: 'cashflow.ledger.entry.recorded.v1',
      published_at: null,
    });
    expect(isLedgerEventV1(row.payload)).toBe(true);
    expect(row.payload).toMatchObject({
      id: row.id,
      type: 'cashflow.ledger.entry.recorded.v1',
      subject: ENTRY_ID,
      time: '2026-10-09T15:00:00.000Z',
      data: { entryId: ENTRY_ID, amountInCents: 15_990, businessDate: '2026-10-09' },
    });
  });

  it('rolls back the entry and its event when the transaction fails', async () => {
    const failure = testDatabase.database.run(async () => {
      await repository.save(recordedEntry());
      throw new Error('failure after saving');
    });

    await expect(failure).rejects.toThrow('failure after saving');
    expect(await testDatabase.count('entries')).toBe(0);
    expect(await testDatabase.count('outbox')).toBe(0);
  });

  it('rejects a second reversal of the same entry at database level', async () => {
    const original = recordedEntry();
    await repository.save(original);
    await repository.save(reversalOf(original));

    await expect(repository.save(reversalOf(original))).rejects.toThrow(EntryAlreadyReversedError);
    expect(await repository.hasReversal(merchant, original.id)).toBe(true);
    expect(await testDatabase.count('outbox')).toBe(2);
  });

  it('rejects an entry referencing a point of sale of another merchant', async () => {
    await new PostgresPointOfSaleRepository(testDatabase.database).save(pointOfSaleIn(NORONHA));
    const entry = recordedEntry({
      merchantId: MerchantId.from(OTHER_MERCHANT_ID),
      pointOfSaleId: PointOfSaleId.from(POINT_OF_SALE_ID),
    });

    await expect(repository.save(entry)).rejects.toThrow(/foreign key/);
  });

  it('finds entries by period with ordering, pagination and merchant isolation', async () => {
    const dates = ['2026-10-03', '2026-10-01', '2026-10-02', '2026-09-30'];
    for (const date of dates) {
      await repository.save(
        recordedEntry({ id: EntryId.from(ids.next()), businessDate: BusinessDate.from(date) }),
      );
    }
    await repository.save(
      recordedEntry({
        id: EntryId.from(ids.next()),
        merchantId: MerchantId.from(OTHER_MERCHANT_ID),
        businessDate: BusinessDate.from('2026-10-02'),
      }),
    );

    const page = await repository.findByPeriod({
      merchantId: merchant,
      from: BusinessDate.from('2026-10-01'),
      to: BusinessDate.from('2026-10-03'),
      limit: 2,
      offset: 1,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((entry) => entry.businessDate.value)).toEqual([
      '2026-10-02',
      '2026-10-03',
    ]);
  });
});

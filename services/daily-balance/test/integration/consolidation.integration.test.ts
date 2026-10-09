import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresDailyBalanceRepository } from '../../src/adapters/outbound/postgres/postgres-daily-balance-repository.js';
import { PostgresMovementJournal } from '../../src/adapters/outbound/postgres/postgres-movement-journal.js';
import {
  ConsolidateMovementService,
  ConsolidationResult,
  RebuildDailyBalanceService,
} from '../../src/application/index.js';
import { BusinessDate, MerchantId } from '../../src/domain/index.js';
import { BUSINESS_DATE, consolidateCommand, MERCHANT_ID } from '../support/fixtures.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

const merchantId = MerchantId.from(MERCHANT_ID);
const businessDate = BusinessDate.from(BUSINESS_DATE);

describe('consolidation with PostgreSQL', () => {
  let testDatabase: TestDatabase;
  let balances: PostgresDailyBalanceRepository;
  let journal: PostgresMovementJournal;
  let consolidate: ConsolidateMovementService;
  let rebuild: RebuildDailyBalanceService;

  const journalTotals = async () => {
    const result = await testDatabase.pool.query<{
      credits: number;
      debits: number;
      count: number;
    }>(
      `SELECT
         coalesce(sum(amount_cents) FILTER (WHERE entry_type = 'CREDIT'), 0)::bigint AS credits,
         coalesce(sum(amount_cents) FILTER (WHERE entry_type = 'DEBIT'), 0)::bigint AS debits,
         count(*)::bigint AS count
       FROM applied_movements`,
    );
    return result.rows[0];
  };

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    balances = new PostgresDailyBalanceRepository(testDatabase.database);
    journal = new PostgresMovementJournal(testDatabase.database);
    const dependencies = { journal, balances, transactions: testDatabase.database };
    consolidate = new ConsolidateMovementService(dependencies);
    rebuild = new RebuildDailyBalanceService(dependencies);
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  it('accumulates credits and debits additively', async () => {
    await consolidate.execute(consolidateCommand({ amountInCents: 10_000 }));
    await consolidate.execute(consolidateCommand({ entryType: 'DEBIT', amountInCents: 2_500 }));

    expect(await balances.find(merchantId, businessDate)).toMatchObject({
      totalCreditsInCents: 10_000,
      totalDebitsInCents: 2_500,
      balanceInCents: 7_500,
      entryCount: 2,
    });
  });

  it('deduplicates by event id and by entry id', async () => {
    const command = consolidateCommand();

    const results = [
      await consolidate.execute(command),
      await consolidate.execute(command),
      await consolidate.execute({ ...command, eventId: randomUUID() }),
    ];

    expect(results).toEqual(['APPLIED', 'DUPLICATE', 'DUPLICATE']);
    expect((await balances.find(merchantId, businessDate))?.entryCount).toBe(1);
  });

  it('counts each event once under concurrent redeliveries', async () => {
    const commands = Array.from({ length: 20 }, () => consolidateCommand({ amountInCents: 100 }));
    const deliveries = [...commands, ...commands, ...commands];

    const results = await Promise.all(deliveries.map((command) => consolidate.execute(command)));

    expect(results.filter((result) => result === ConsolidationResult.APPLIED)).toHaveLength(20);
    expect(await balances.find(merchantId, businessDate)).toMatchObject({
      totalCreditsInCents: 2_000,
      entryCount: 20,
    });
  });

  it('keeps the balance consistent when a rebuild runs during consolidation', async () => {
    const commands = Array.from({ length: 60 }, (_, index) =>
      consolidateCommand({
        entryType: index % 3 === 0 ? 'DEBIT' : 'CREDIT',
        amountInCents: 100 + index,
      }),
    );
    const rebuildDay = () =>
      rebuild.execute({ merchantId: MERCHANT_ID, businessDate: BUSINESS_DATE });

    await Promise.all([
      ...commands.map((command) => consolidate.execute(command)),
      ...Array.from({ length: 5 }, rebuildDay),
    ]);
    const totals = await journalTotals();

    expect(await balances.find(merchantId, businessDate)).toMatchObject({
      totalCreditsInCents: totals?.credits,
      totalDebitsInCents: totals?.debits,
      entryCount: 60,
    });
  });

  it('rebuilds a corrupted daily balance from the journal', async () => {
    await consolidate.execute(consolidateCommand({ amountInCents: 10_000 }));
    await consolidate.execute(consolidateCommand({ entryType: 'DEBIT', amountInCents: 4_000 }));
    await testDatabase.pool.query(
      'UPDATE daily_balances SET total_credits_cents = 1, total_debits_cents = 0, entry_count = 0',
    );

    const view = await rebuild.execute({ merchantId: MERCHANT_ID, businessDate: BUSINESS_DATE });

    expect(view).toMatchObject({ balanceInCents: 6_000, entryCount: 2 });
    expect(await balances.find(merchantId, businessDate)).toMatchObject({
      balanceInCents: 6_000,
      entryCount: 2,
    });
  });

  it('returns null for a day without balance', async () => {
    expect(await balances.find(merchantId, BusinessDate.from('2026-01-01'))).toBeNull();
  });
});

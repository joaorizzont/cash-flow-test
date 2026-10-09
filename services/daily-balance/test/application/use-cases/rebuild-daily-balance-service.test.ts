import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConsolidateMovementService,
  RebuildDailyBalanceService,
} from '../../../src/application/index.js';
import {
  BusinessDate,
  DailyBalance,
  MerchantId,
  ValidationError,
} from '../../../src/domain/index.js';
import {
  BUSINESS_DATE,
  consolidateCommand,
  MERCHANT_ID,
  OTHER_MERCHANT_ID,
} from '../../support/fixtures.js';
import { ImmediateTransactionRunner } from '../../support/immediate-transaction-runner.js';
import { InMemoryDailyBalanceRepository } from '../../support/in-memory-daily-balance-repository.js';
import { InMemoryMovementJournal } from '../../support/in-memory-movement-journal.js';

const merchantId = MerchantId.from(MERCHANT_ID);
const businessDate = BusinessDate.from(BUSINESS_DATE);

describe('RebuildDailyBalanceService', () => {
  let balances: InMemoryDailyBalanceRepository;
  let consolidate: ConsolidateMovementService;
  let service: RebuildDailyBalanceService;

  beforeEach(() => {
    const dependencies = {
      journal: new InMemoryMovementJournal(),
      balances: (balances = new InMemoryDailyBalanceRepository()),
      transactions: new ImmediateTransactionRunner(),
    };
    consolidate = new ConsolidateMovementService(dependencies);
    service = new RebuildDailyBalanceService(dependencies);
  });

  it('recomputes a corrupted daily balance from the journal', async () => {
    await consolidate.execute(consolidateCommand({ amountInCents: 10_000 }));
    await consolidate.execute(consolidateCommand({ entryType: 'DEBIT', amountInCents: 3_000 }));
    await consolidate.execute(consolidateCommand({ merchantId: OTHER_MERCHANT_ID }));
    await balances.replace(DailyBalance.empty(merchantId, businessDate));

    const view = await service.execute({ merchantId: MERCHANT_ID, businessDate: BUSINESS_DATE });

    expect(view).toEqual({
      merchantId: MERCHANT_ID,
      businessDate: BUSINESS_DATE,
      totalCreditsInCents: 10_000,
      totalDebitsInCents: 3_000,
      balanceInCents: 7_000,
      entryCount: 2,
    });
    expect(await balances.find(merchantId, businessDate)).toMatchObject({ balanceInCents: 7_000 });
  });

  it('locks the day before reading the journal', async () => {
    await service.execute({ merchantId: MERCHANT_ID, businessDate: BUSINESS_DATE });

    expect(balances.locks).toEqual([`${MERCHANT_ID}/${BUSINESS_DATE}`]);
  });

  it('produces an empty balance for a day without movements', async () => {
    const view = await service.execute({ merchantId: MERCHANT_ID, businessDate: '2026-10-01' });

    expect(view).toMatchObject({ balanceInCents: 0, entryCount: 0 });
  });

  it('rejects an invalid date', async () => {
    await expect(
      service.execute({ merchantId: MERCHANT_ID, businessDate: '2026-02-30' }),
    ).rejects.toThrow(ValidationError);
  });
});

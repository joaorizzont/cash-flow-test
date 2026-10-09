import { beforeEach, describe, expect, it } from 'vitest';
import { ConsolidateMovementService, ConsolidationResult } from '../../../src/application/index.js';
import { BusinessDate, MerchantId, ValidationError } from '../../../src/domain/index.js';
import { BUSINESS_DATE, consolidateCommand, MERCHANT_ID } from '../../support/fixtures.js';
import { ImmediateTransactionRunner } from '../../support/immediate-transaction-runner.js';
import { InMemoryDailyBalanceRepository } from '../../support/in-memory-daily-balance-repository.js';
import { InMemoryMovementJournal } from '../../support/in-memory-movement-journal.js';

describe('ConsolidateMovementService', () => {
  let journal: InMemoryMovementJournal;
  let balances: InMemoryDailyBalanceRepository;
  let service: ConsolidateMovementService;

  const dailyBalance = () =>
    balances.find(MerchantId.from(MERCHANT_ID), BusinessDate.from(BUSINESS_DATE));

  beforeEach(() => {
    journal = new InMemoryMovementJournal();
    balances = new InMemoryDailyBalanceRepository();
    service = new ConsolidateMovementService({
      journal,
      balances,
      transactions: new ImmediateTransactionRunner(),
    });
  });

  it('adds a credit to the daily balance', async () => {
    const result = await service.execute(consolidateCommand({ amountInCents: 15_990 }));

    expect(result).toBe(ConsolidationResult.APPLIED);
    expect(await dailyBalance()).toMatchObject({
      totalCreditsInCents: 15_990,
      totalDebitsInCents: 0,
      balanceInCents: 15_990,
      entryCount: 1,
    });
  });

  it('accumulates credits and debits of the same day', async () => {
    await service.execute(consolidateCommand({ amountInCents: 10_000 }));
    await service.execute(consolidateCommand({ entryType: 'DEBIT', amountInCents: 2_500 }));

    expect(await dailyBalance()).toMatchObject({
      totalCreditsInCents: 10_000,
      totalDebitsInCents: 2_500,
      balanceInCents: 7_500,
      entryCount: 2,
    });
  });

  it('ignores a redelivered event', async () => {
    const command = consolidateCommand();

    await service.execute(command);
    const result = await service.execute(command);

    expect(result).toBe(ConsolidationResult.DUPLICATE);
    expect((await dailyBalance())?.entryCount).toBe(1);
  });

  it('ignores a second event for an entry already consolidated', async () => {
    const command = consolidateCommand();

    await service.execute(command);
    const result = await service.execute({ ...command, eventId: crypto.randomUUID() });

    expect(result).toBe(ConsolidationResult.DUPLICATE);
    expect((await dailyBalance())?.entryCount).toBe(1);
  });

  it('records the event in the journal', async () => {
    const command = consolidateCommand();

    await service.execute(command);

    expect(journal.records).toEqual([
      expect.objectContaining({
        eventId: command.eventId,
        eventType: command.eventType,
        occurredAt: command.occurredAt,
      }),
    ]);
  });

  it.each([
    { entryType: 'TRANSFER' },
    { amountInCents: 0 },
    { currency: 'USD' },
    { businessDate: '2026-02-30' },
    { merchantId: 'merchant-1' },
  ])('rejects an invalid movement %o without touching the balance', async (overrides) => {
    await expect(service.execute(consolidateCommand(overrides))).rejects.toThrow(ValidationError);

    expect(journal.records).toHaveLength(0);
  });
});

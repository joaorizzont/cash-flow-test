import { beforeEach, describe, expect, it } from 'vitest';
import {
  EntryAlreadyReversedError,
  EntryNotFoundError,
  ReverseEntryService,
} from '../../../src/application/index.js';
import { EntryType, ReversalOfReversalError } from '../../../src/domain/index.js';
import {
  ENTRY_ID,
  MERCHANT_ID,
  NOW,
  OTHER_MERCHANT_ID,
  recordedEntry,
} from '../../support/entry-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryEntryRepository } from '../../support/in-memory-entry-repository.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

describe('ReverseEntryService', () => {
  let repository: InMemoryEntryRepository;
  let service: ReverseEntryService;

  beforeEach(async () => {
    repository = new InMemoryEntryRepository();
    await repository.save(recordedEntry({ type: EntryType.CREDIT }));
    service = new ReverseEntryService({
      repository,
      clock: new FixedClock(NOW),
      idGenerator: new SequentialIdGenerator(),
    });
  });

  it('records a reversal with a default reason', async () => {
    const view = await service.execute({ merchantId: MERCHANT_ID, entryId: ENTRY_ID });

    expect(view).toMatchObject({
      type: 'DEBIT',
      amountInCents: 15_990,
      reversalOf: ENTRY_ID,
      description: `Reversal of entry ${ENTRY_ID}`,
    });
    expect(repository.all()).toHaveLength(2);
  });

  it('uses the informed reason', async () => {
    const view = await service.execute({
      merchantId: MERCHANT_ID,
      entryId: ENTRY_ID,
      reason: 'Duplicated sale',
    });

    expect(view.description).toBe('Duplicated sale');
  });

  it('fails when the entry belongs to another merchant', async () => {
    await expect(
      service.execute({ merchantId: OTHER_MERCHANT_ID, entryId: ENTRY_ID }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('fails when the entry was already reversed', async () => {
    await service.execute({ merchantId: MERCHANT_ID, entryId: ENTRY_ID });

    await expect(service.execute({ merchantId: MERCHANT_ID, entryId: ENTRY_ID })).rejects.toThrow(
      EntryAlreadyReversedError,
    );
  });

  it('fails when trying to reverse a reversal', async () => {
    const reversal = await service.execute({ merchantId: MERCHANT_ID, entryId: ENTRY_ID });

    await expect(
      service.execute({ merchantId: MERCHANT_ID, entryId: reversal.id }),
    ).rejects.toThrow(ReversalOfReversalError);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { RecordEntryService, type RecordEntryCommand } from '../../../src/application/index.js';
import {
  BusinessDateOutOfRangeError,
  BusinessDatePolicy,
  ValidationError,
} from '../../../src/domain/index.js';
import { MERCHANT_ID, NOW, TODAY } from '../../support/entry-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryEntryRepository } from '../../support/in-memory-entry-repository.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const command = (overrides: Partial<RecordEntryCommand> = {}): RecordEntryCommand => ({
  merchantId: MERCHANT_ID,
  type: 'DEBIT',
  amountInCents: 4_500,
  businessDate: TODAY,
  description: 'Office supplies',
  ...overrides,
});

describe('RecordEntryService', () => {
  let repository: InMemoryEntryRepository;
  let service: RecordEntryService;

  beforeEach(() => {
    repository = new InMemoryEntryRepository();
    service = new RecordEntryService({
      repository,
      clock: new FixedClock(NOW),
      idGenerator: new SequentialIdGenerator(),
      businessDatePolicy: new BusinessDatePolicy(30),
    });
  });

  it('records the entry and returns its view', async () => {
    const view = await service.execute(command());

    expect(view).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      merchantId: MERCHANT_ID,
      type: 'DEBIT',
      amountInCents: 4_500,
      currency: 'BRL',
      businessDate: TODAY,
      description: 'Office supplies',
      reversalOf: null,
      recordedAt: NOW.toISOString(),
    });
    expect(repository.all()).toHaveLength(1);
  });

  it('keeps the EntryRecorded event on the saved aggregate for the outbox', async () => {
    await service.execute(command());

    const [saved] = repository.all();
    expect(saved?.pullDomainEvents()).toEqual([expect.objectContaining({ name: 'EntryRecorded' })]);
  });

  it('rejects business dates outside the accepted window', async () => {
    await expect(service.execute(command({ businessDate: '2026-10-10' }))).rejects.toThrow(
      BusinessDateOutOfRangeError,
    );
    expect(repository.all()).toHaveLength(0);
  });

  it.each([
    { type: 'TRANSFER' },
    { amountInCents: 0 },
    { currency: 'USD' },
    { description: ' ' },
    { merchantId: 'merchant-1' },
  ])('rejects invalid input %j', async (overrides) => {
    await expect(service.execute(command(overrides))).rejects.toThrow(ValidationError);
    expect(repository.all()).toHaveLength(0);
  });
});

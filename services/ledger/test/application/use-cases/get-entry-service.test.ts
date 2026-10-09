import { describe, expect, it } from 'vitest';
import { EntryNotFoundError, GetEntryService } from '../../../src/application/index.js';
import {
  ENTRY_ID,
  MERCHANT_ID,
  OTHER_MERCHANT_ID,
  recordedEntry,
} from '../../support/entry-fixtures.js';
import { InMemoryEntryRepository } from '../../support/in-memory-entry-repository.js';

describe('GetEntryService', () => {
  const setup = async (): Promise<GetEntryService> => {
    const repository = new InMemoryEntryRepository();
    await repository.save(recordedEntry());
    return new GetEntryService(repository);
  };

  it('returns the entry view', async () => {
    const service = await setup();

    const view = await service.execute({ merchantId: MERCHANT_ID, entryId: ENTRY_ID });

    expect(view).toMatchObject({ id: ENTRY_ID, merchantId: MERCHANT_ID });
  });

  it('fails for an entry of another merchant', async () => {
    const service = await setup();

    await expect(
      service.execute({ merchantId: OTHER_MERCHANT_ID, entryId: ENTRY_ID }),
    ).rejects.toThrow(EntryNotFoundError);
  });
});

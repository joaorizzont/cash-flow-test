import { EntryId, MerchantId } from '../../domain/index.js';
import { EntryNotFoundError } from '../errors/entry-not-found-error.js';
import { toEntryView, type EntryView } from '../ports/inbound/entry-view.js';
import type { GetEntry, GetEntryQuery } from '../ports/inbound/get-entry.js';
import type { EntryRepository } from '../ports/outbound/entry-repository.js';

export class GetEntryService implements GetEntry {
  constructor(private readonly repository: EntryRepository) {}

  async execute(query: GetEntryQuery): Promise<EntryView> {
    const entryId = EntryId.from(query.entryId);
    const entry = await this.repository.findById(MerchantId.from(query.merchantId), entryId);
    if (entry === null) {
      throw new EntryNotFoundError(entryId.value);
    }
    return toEntryView(entry);
  }
}

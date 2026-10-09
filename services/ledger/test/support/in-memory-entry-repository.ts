import type { EntryPage, EntryPeriodQuery, EntryRepository } from '../../src/application/index.js';
import type { Entry, EntryId, MerchantId } from '../../src/domain/index.js';

const isWithinPeriod = (entry: Entry, query: EntryPeriodQuery): boolean =>
  entry.merchantId.equals(query.merchantId) &&
  !query.from.isAfter(entry.businessDate) &&
  !entry.businessDate.isAfter(query.to);

const byBusinessDateThenRecordedAt = (left: Entry, right: Entry): number =>
  left.businessDate.value.localeCompare(right.businessDate.value) ||
  left.recordedAt.getTime() - right.recordedAt.getTime();

export class InMemoryEntryRepository implements EntryRepository {
  private readonly entries: Entry[] = [];

  async save(entry: Entry): Promise<void> {
    this.entries.push(entry);
  }

  async findById(merchantId: MerchantId, id: EntryId): Promise<Entry | null> {
    return (
      this.entries.find((entry) => entry.merchantId.equals(merchantId) && entry.id.equals(id)) ??
      null
    );
  }

  async hasReversal(merchantId: MerchantId, id: EntryId): Promise<boolean> {
    return this.entries.some(
      (entry) => entry.merchantId.equals(merchantId) && entry.reversalOf?.equals(id) === true,
    );
  }

  async findByPeriod(query: EntryPeriodQuery): Promise<EntryPage> {
    const matching = this.entries
      .filter((entry) => isWithinPeriod(entry, query))
      .sort(byBusinessDateThenRecordedAt);
    return {
      items: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
    };
  }

  all(): readonly Entry[] {
    return this.entries;
  }
}

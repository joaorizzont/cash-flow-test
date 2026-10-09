import type {
  IdempotencyRecord,
  IdempotencyStore,
  StoredIdempotentResponse,
} from '../../src/application/index.js';

const keyOf = (record: IdempotencyRecord): string => `${record.merchantId}:${record.key}`;

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, StoredIdempotentResponse>();

  async reserve(record: IdempotencyRecord): Promise<StoredIdempotentResponse | null> {
    const stored = this.records.get(keyOf(record));
    if (stored !== undefined) {
      return stored;
    }
    this.records.set(keyOf(record), { ...record, response: null });
    return null;
  }

  async complete(record: IdempotencyRecord, response: unknown): Promise<void> {
    this.records.set(keyOf(record), { ...record, response });
  }
}

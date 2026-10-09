import { IdempotencyKeyReusedError } from '../errors/idempotency-key-reused-error.js';
import type {
  IdempotencyRecord,
  IdempotencyStore,
  StoredIdempotentResponse,
} from '../ports/outbound/idempotency-store.js';
import type { TransactionRunner } from '../ports/outbound/transaction-runner.js';

export interface IdempotentRequest extends Omit<IdempotencyRecord, 'key'> {
  readonly key: string | null;
}

export interface IdempotentResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface IdempotencyGuardDependencies {
  readonly store: IdempotencyStore;
  readonly transactions: TransactionRunner;
}

const matches = (stored: StoredIdempotentResponse, record: IdempotencyRecord): boolean =>
  stored.operation === record.operation && stored.fingerprint === record.fingerprint;

export class IdempotencyGuard {
  constructor(private readonly dependencies: IdempotencyGuardDependencies) {}

  async execute<T>(
    request: IdempotentRequest,
    work: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const { key } = request;
    if (key === null) {
      return { value: await work(), replayed: false };
    }
    return this.dependencies.transactions.run(() => this.executeOnce({ ...request, key }, work));
  }

  private async executeOnce<T>(
    record: IdempotencyRecord,
    work: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const { store } = this.dependencies;
    const stored = await store.reserve(record);
    if (stored !== null) {
      return { value: this.replay<T>(stored, record), replayed: true };
    }
    const value = await work();
    await store.complete(record, value);
    return { value, replayed: false };
  }

  private replay<T>(stored: StoredIdempotentResponse, record: IdempotencyRecord): T {
    if (!matches(stored, record)) {
      throw new IdempotencyKeyReusedError(record.key);
    }
    return stored.response as T;
  }
}

export interface IdempotencyRecord {
  readonly merchantId: string;
  readonly key: string;
  readonly operation: string;
  readonly fingerprint: string;
}

export interface StoredIdempotentResponse {
  readonly operation: string;
  readonly fingerprint: string;
  readonly response: unknown;
}

export interface IdempotencyStore {
  reserve(record: IdempotencyRecord): Promise<StoredIdempotentResponse | null>;
  complete(record: IdempotencyRecord, response: unknown): Promise<void>;
}

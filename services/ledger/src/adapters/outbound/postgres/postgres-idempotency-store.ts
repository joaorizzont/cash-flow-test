import type {
  IdempotencyRecord,
  IdempotencyStore,
  StoredIdempotentResponse,
} from '../../../application/index.js';
import type { Queryable } from './postgres-database.js';

interface IdempotencyRow {
  readonly operation: string;
  readonly request_fingerprint: string;
  readonly response: unknown;
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: Queryable) {}

  async reserve(record: IdempotencyRecord): Promise<StoredIdempotentResponse | null> {
    const inserted = await this.database.query(
      `INSERT INTO idempotency_keys (merchant_id, key, operation, request_fingerprint)
       VALUES ($1, $2, $3, $4) ON CONFLICT (merchant_id, key) DO NOTHING`,
      [record.merchantId, record.key, record.operation, record.fingerprint],
    );
    return inserted.rowCount === 1 ? null : this.find(record);
  }

  async complete(record: IdempotencyRecord, response: unknown): Promise<void> {
    await this.database.query(
      'UPDATE idempotency_keys SET response = $3 WHERE merchant_id = $1 AND key = $2',
      [record.merchantId, record.key, JSON.stringify(response)],
    );
  }

  private async find(record: IdempotencyRecord): Promise<StoredIdempotentResponse> {
    const result = await this.database.query<IdempotencyRow>(
      `SELECT operation, request_fingerprint, response FROM idempotency_keys
       WHERE merchant_id = $1 AND key = $2`,
      [record.merchantId, record.key],
    );
    const [row] = result.rows;
    if (row === undefined) {
      throw new Error(`Idempotency key ${record.key} vanished after a conflict`);
    }
    return {
      operation: row.operation,
      fingerprint: row.request_fingerprint,
      response: row.response,
    };
  }
}

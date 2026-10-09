import type {
  OutboxFailure,
  OutboxStore,
  PendingOutboxMessage,
} from '../../../application/index.js';
import type { Queryable } from './postgres-database.js';

interface OutboxRow {
  readonly id: string;
  readonly event_type: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface OutboxBacklog {
  readonly pending: number;
  readonly oldestOccurredAt: Date | null;
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly database: Queryable) {}

  async lockPending(limit: number, now: Date): Promise<readonly PendingOutboxMessage[]> {
    const result = await this.database.query<OutboxRow>(
      `SELECT id, event_type, payload, attempts FROM outbox
       WHERE published_at IS NULL AND next_attempt_at <= $2
       ORDER BY next_attempt_at, occurred_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit, now],
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      body: row.payload,
      attempts: row.attempts,
    }));
  }

  async backlog(): Promise<OutboxBacklog> {
    const result = await this.database.query<{ pending: number; oldest: Date | null }>(
      `SELECT count(*)::bigint AS pending, min(occurred_at) AS oldest
       FROM outbox WHERE published_at IS NULL`,
    );
    const row = result.rows[0];
    return { pending: row?.pending ?? 0, oldestOccurredAt: row?.oldest ?? null };
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    await this.database.query('UPDATE outbox SET published_at = $2 WHERE id = ANY($1::uuid[])', [
      ids,
      publishedAt,
    ]);
  }

  async recordFailures(failures: readonly OutboxFailure[]): Promise<void> {
    await this.database.query(
      `UPDATE outbox AS outbox
       SET attempts = outbox.attempts + 1,
           last_error = failure.reason,
           next_attempt_at = failure.next_attempt_at
       FROM unnest($1::uuid[], $2::text[], $3::timestamptz[])
         AS failure (id, reason, next_attempt_at)
       WHERE outbox.id = failure.id`,
      [
        failures.map((failure) => failure.id),
        failures.map((failure) => failure.reason),
        failures.map((failure) => failure.nextAttemptAt),
      ],
    );
  }
}

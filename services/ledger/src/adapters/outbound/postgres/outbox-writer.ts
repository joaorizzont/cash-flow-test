import type { IdGenerator } from '../../../application/index.js';
import type { EntryEvent } from '../../../domain/index.js';
import type { Queryable } from './postgres-database.js';

const ENTRY_AGGREGATE = 'Entry';

const payloadOf = (event: EntryEvent): Record<string, unknown> => ({
  ...event,
  occurredAt: event.occurredAt.toISOString(),
});

export class OutboxWriter {
  constructor(
    private readonly database: Queryable,
    private readonly idGenerator: IdGenerator,
  ) {}

  async append(events: readonly EntryEvent[]): Promise<void> {
    for (const event of events) {
      await this.database.query(
        `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          this.idGenerator.next(),
          ENTRY_AGGREGATE,
          event.entryId,
          event.name,
          JSON.stringify(payloadOf(event)),
          event.occurredAt,
        ],
      );
    }
  }
}

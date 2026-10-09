import type { IdGenerator } from '../../../application/index.js';
import type { EntryEvent } from '../../../domain/index.js';
import { toLedgerEventV1 } from '../messaging/ledger-event-mapper.js';
import type { Queryable } from './postgres-database.js';

const ENTRY_AGGREGATE = 'Entry';

export class OutboxWriter {
  constructor(
    private readonly database: Queryable,
    private readonly idGenerator: IdGenerator,
  ) {}

  async append(events: readonly EntryEvent[]): Promise<void> {
    for (const event of events) {
      const message = toLedgerEventV1(event, this.idGenerator.next());
      await this.database.query(
        `INSERT INTO outbox
           (id, aggregate_type, aggregate_id, event_type, payload, occurred_at, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [
          message.id,
          ENTRY_AGGREGATE,
          event.entryId,
          message.type,
          JSON.stringify(message),
          event.occurredAt,
        ],
      );
    }
  }
}

import type { JournalRecord, MovementJournal } from '../../../application/index.js';
import {
  BusinessDate,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  type Movement,
} from '../../../domain/index.js';
import type { Queryable } from './postgres-database.js';

interface MovementRow {
  readonly entry_id: string;
  readonly merchant_id: string;
  readonly business_date: string;
  readonly entry_type: string;
  readonly amount_cents: number;
}

const toMovement = (row: MovementRow): Movement => ({
  entryId: EntryId.from(row.entry_id),
  merchantId: MerchantId.from(row.merchant_id),
  businessDate: BusinessDate.from(row.business_date),
  type: parseEntryType(row.entry_type),
  amount: Money.of(row.amount_cents),
});

export class PostgresMovementJournal implements MovementJournal {
  constructor(private readonly database: Queryable) {}

  async append(record: JournalRecord): Promise<boolean> {
    const { movement } = record;
    const result = await this.database.query(
      `INSERT INTO applied_movements
         (event_id, event_type, entry_id, merchant_id, business_date, entry_type, amount_cents, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        record.eventId,
        record.eventType,
        movement.entryId.value,
        movement.merchantId.value,
        movement.businessDate.value,
        movement.type,
        movement.amount.cents,
        record.occurredAt,
      ],
    );
    return result.rowCount === 1;
  }

  async movementsOf(
    merchantId: MerchantId,
    businessDate: BusinessDate,
  ): Promise<readonly Movement[]> {
    const result = await this.database.query<MovementRow>(
      `SELECT entry_id, merchant_id, business_date, entry_type, amount_cents
       FROM applied_movements
       WHERE merchant_id = $1 AND business_date = $2
       ORDER BY occurred_at, event_id`,
      [merchantId.value, businessDate.value],
    );
    return result.rows.map(toMovement);
  }
}

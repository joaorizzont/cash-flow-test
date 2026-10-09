import {
  EntryAlreadyReversedError,
  type EntryPage,
  type EntryPeriodQuery,
  type EntryRepository,
} from '../../../application/index.js';
import type { Entry, EntryId, MerchantId } from '../../../domain/index.js';
import { ENTRY_COLUMNS, toEntry, toEntryValues, type EntryRow } from './entry-row.js';
import type { OutboxWriter } from './outbox-writer.js';
import type { PostgresDatabase } from './postgres-database.js';
import { isUniqueViolation } from './postgres-errors.js';

const REVERSAL_CONSTRAINT = 'entries_reversal_of_uidx';

export class PostgresEntryRepository implements EntryRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly outbox: OutboxWriter,
  ) {}

  async save(entry: Entry): Promise<void> {
    await this.database.run(async () => {
      await this.insert(entry);
      await this.outbox.append(entry.pullDomainEvents());
    });
  }

  async findById(merchantId: MerchantId, id: EntryId): Promise<Entry | null> {
    const result = await this.database.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE merchant_id = $1 AND id = $2`,
      [merchantId.value, id.value],
    );
    const [row] = result.rows;
    return row === undefined ? null : toEntry(row);
  }

  async hasReversal(merchantId: MerchantId, id: EntryId): Promise<boolean> {
    const result = await this.database.query(
      'SELECT 1 FROM entries WHERE merchant_id = $1 AND reversal_of = $2',
      [merchantId.value, id.value],
    );
    return result.rowCount !== 0;
  }

  async findByPeriod(query: EntryPeriodQuery): Promise<EntryPage> {
    const filter = [query.merchantId.value, query.from.value, query.to.value];
    const where = 'WHERE merchant_id = $1 AND business_date BETWEEN $2 AND $3';
    const [page, count] = await Promise.all([
      this.database.query<EntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM entries ${where}
         ORDER BY business_date, recorded_at, id LIMIT $4 OFFSET $5`,
        [...filter, query.limit, query.offset],
      ),
      this.database.query<{ total: number }>(
        `SELECT count(*)::bigint AS total FROM entries ${where}`,
        filter,
      ),
    ]);
    return { items: page.rows.map(toEntry), total: count.rows[0]?.total ?? 0 };
  }

  private async insert(entry: Entry): Promise<void> {
    try {
      await this.database.query(
        `INSERT INTO entries (${ENTRY_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        toEntryValues(entry),
      );
    } catch (error) {
      if (entry.reversalOf !== null && isUniqueViolation(error, REVERSAL_CONSTRAINT)) {
        throw new EntryAlreadyReversedError(entry.reversalOf.value);
      }
      throw error;
    }
  }
}

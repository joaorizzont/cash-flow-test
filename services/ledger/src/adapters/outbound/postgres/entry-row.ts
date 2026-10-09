import {
  BusinessDate,
  Description,
  Entry,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  PointOfSaleId,
  TimeZone,
} from '../../../domain/index.js';

export interface EntryRow {
  readonly id: string;
  readonly merchant_id: string;
  readonly point_of_sale_id: string | null;
  readonly type: string;
  readonly amount_in_cents: number;
  readonly currency: string;
  readonly business_date: string;
  readonly description: string;
  readonly reversal_of: string | null;
  readonly recorded_at: Date;
  readonly time_zone: string;
}

export const ENTRY_COLUMNS = `id, merchant_id, point_of_sale_id, type, amount_in_cents, currency,
  business_date, description, reversal_of, recorded_at, time_zone`;

export const toEntry = (row: EntryRow): Entry =>
  Entry.restore({
    id: EntryId.from(row.id),
    merchantId: MerchantId.from(row.merchant_id),
    pointOfSaleId: row.point_of_sale_id === null ? null : PointOfSaleId.from(row.point_of_sale_id),
    type: parseEntryType(row.type),
    amount: Money.of(row.amount_in_cents, row.currency),
    businessDate: BusinessDate.from(row.business_date),
    description: Description.from(row.description),
    reversalOf: row.reversal_of === null ? null : EntryId.from(row.reversal_of),
    recordedAt: row.recorded_at,
    timeZone: TimeZone.from(row.time_zone),
  });

export const toEntryValues = (entry: Entry): readonly unknown[] => [
  entry.id.value,
  entry.merchantId.value,
  entry.pointOfSaleId?.value ?? null,
  entry.type,
  entry.amount.cents,
  entry.amount.currency,
  entry.businessDate.value,
  entry.description.value,
  entry.reversalOf?.value ?? null,
  entry.recordedAt,
  entry.timeZone.value,
];

import type { Currency, Entry, EntryType } from '../../../domain/index.js';

export interface EntryView {
  readonly id: string;
  readonly merchantId: string;
  readonly pointOfSaleId: string | null;
  readonly type: EntryType;
  readonly amountInCents: number;
  readonly currency: Currency;
  readonly businessDate: string;
  readonly description: string;
  readonly reversalOf: string | null;
  readonly recordedAt: string;
  readonly recordedAtLocal: string;
  readonly timeZone: string;
}

export const toEntryView = (entry: Entry): EntryView => ({
  id: entry.id.value,
  merchantId: entry.merchantId.value,
  pointOfSaleId: entry.pointOfSaleId?.value ?? null,
  type: entry.type,
  amountInCents: entry.amount.cents,
  currency: entry.amount.currency,
  businessDate: entry.businessDate.value,
  description: entry.description.value,
  reversalOf: entry.reversalOf?.value ?? null,
  recordedAt: entry.recordedAt.toISOString(),
  recordedAtLocal: entry.timeZone.localDateTimeOf(entry.recordedAt),
  timeZone: entry.timeZone.value,
});

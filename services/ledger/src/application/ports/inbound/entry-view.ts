import type { Currency, Entry, EntryType } from '../../../domain/index.js';

export interface EntryView {
  readonly id: string;
  readonly merchantId: string;
  readonly type: EntryType;
  readonly amountInCents: number;
  readonly currency: Currency;
  readonly businessDate: string;
  readonly description: string;
  readonly reversalOf: string | null;
  readonly recordedAt: string;
}

export const toEntryView = (entry: Entry): EntryView => ({
  id: entry.id.value,
  merchantId: entry.merchantId.value,
  type: entry.type,
  amountInCents: entry.amount.cents,
  currency: entry.amount.currency,
  businessDate: entry.businessDate.value,
  description: entry.description.value,
  reversalOf: entry.reversalOf?.value ?? null,
  recordedAt: entry.recordedAt.toISOString(),
});

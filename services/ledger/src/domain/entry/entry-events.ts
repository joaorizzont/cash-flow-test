import type { Currency } from './money.js';
import type { EntryType } from './entry-type.js';

interface EntryEventPayload {
  readonly entryId: string;
  readonly merchantId: string;
  readonly entryType: EntryType;
  readonly amountInCents: number;
  readonly currency: Currency;
  readonly businessDate: string;
  readonly occurredAt: Date;
}

export interface EntryRecorded extends EntryEventPayload {
  readonly name: 'EntryRecorded';
}

export interface EntryReversed extends EntryEventPayload {
  readonly name: 'EntryReversed';
  readonly reversedEntryId: string;
}

export type EntryEvent = EntryRecorded | EntryReversed;

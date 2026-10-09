import {
  CLOUD_EVENTS_SPEC_VERSION,
  ENTRY_RECORDED_V1,
  ENTRY_REVERSED_V1,
  LEDGER_EVENT_SOURCE,
  type EntryRecordedDataV1,
  type LedgerEventV1,
} from '@cash-flow/contracts';
import type { EntryEvent } from '../../../domain/index.js';

const dataOf = (event: EntryEvent): EntryRecordedDataV1 => ({
  entryId: event.entryId,
  merchantId: event.merchantId,
  pointOfSaleId: event.pointOfSaleId,
  entryType: event.entryType,
  amountInCents: event.amountInCents,
  currency: event.currency,
  businessDate: event.businessDate,
});

export const toLedgerEventV1 = (event: EntryEvent, eventId: string): LedgerEventV1 => {
  const envelope = {
    specversion: CLOUD_EVENTS_SPEC_VERSION,
    id: eventId,
    source: LEDGER_EVENT_SOURCE,
    subject: event.entryId,
    time: event.occurredAt.toISOString(),
    datacontenttype: 'application/json',
  } as const;

  if (event.name === 'EntryReversed') {
    return {
      ...envelope,
      type: ENTRY_REVERSED_V1,
      data: { ...dataOf(event), reversedEntryId: event.reversedEntryId },
    };
  }
  return { ...envelope, type: ENTRY_RECORDED_V1, data: dataOf(event) };
};

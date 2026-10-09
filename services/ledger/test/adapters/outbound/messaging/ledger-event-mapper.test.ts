import {
  describeLedgerEventErrors,
  ENTRY_RECORDED_V1,
  ENTRY_REVERSED_V1,
  isLedgerEventV1,
} from '@cash-flow/contracts';
import { describe, expect, it } from 'vitest';
import { toLedgerEventV1 } from '../../../../src/adapters/outbound/messaging/ledger-event-mapper.js';
import {
  Description,
  EntryId,
  PointOfSaleId,
  type Entry,
  type EntryEvent,
} from '../../../../src/domain/index.js';
import {
  ENTRY_ID,
  MERCHANT_ID,
  POINT_OF_SALE_ID,
  recordedEntry,
} from '../../../support/entry-fixtures.js';

const EVENT_ID = '01a12170-5d59-70fd-b181-3c8a5960d348';
const REVERSAL_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const onlyEventOf = (entry: Entry): EntryEvent => {
  const [event, ...others] = entry.pullDomainEvents();
  if (event === undefined || others.length > 0) {
    throw new Error('Expected exactly one domain event');
  }
  return event;
};

describe('toLedgerEventV1', () => {
  it('maps EntryRecorded to a valid CloudEvent of the v1 contract', () => {
    const entry = recordedEntry({ pointOfSaleId: PointOfSaleId.from(POINT_OF_SALE_ID) });
    const message = toLedgerEventV1(onlyEventOf(entry), EVENT_ID);

    expect(describeLedgerEventErrors(message)).toEqual([]);
    expect(isLedgerEventV1(message)).toBe(true);
    expect(message).toEqual({
      specversion: '1.0',
      id: EVENT_ID,
      source: '/cash-flow/ledger',
      type: ENTRY_RECORDED_V1,
      subject: ENTRY_ID,
      time: '2026-10-09T15:00:00.000Z',
      datacontenttype: 'application/json',
      data: {
        entryId: ENTRY_ID,
        merchantId: MERCHANT_ID,
        pointOfSaleId: POINT_OF_SALE_ID,
        entryType: 'CREDIT',
        amountInCents: 15_990,
        currency: 'BRL',
        businessDate: '2026-10-09',
      },
    });
  });

  it('maps EntryReversed including the reversed entry', () => {
    const reversal = recordedEntry().reverse({
      id: EntryId.from(REVERSAL_ID),
      description: Description.from('Refund'),
      recordedAt: new Date('2026-10-09T18:00:00.000Z'),
    });
    const message = toLedgerEventV1(onlyEventOf(reversal), EVENT_ID);

    expect(isLedgerEventV1(message)).toBe(true);
    expect(message).toMatchObject({
      type: ENTRY_REVERSED_V1,
      subject: REVERSAL_ID,
      data: { entryId: REVERSAL_ID, entryType: 'DEBIT', reversedEntryId: ENTRY_ID },
    });
  });
});

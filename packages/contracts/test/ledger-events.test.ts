import { describe, expect, it } from 'vitest';
import {
  describeLedgerEventErrors,
  ENTRY_RECORDED_V1,
  ENTRY_REVERSED_V1,
  isLedgerEventV1,
  type EntryRecordedV1,
} from '../src/index.js';

const recorded: EntryRecordedV1 = {
  specversion: '1.0',
  id: '01a12170-5d59-70fd-b181-3c8a5960d348',
  source: '/cash-flow/ledger',
  type: ENTRY_RECORDED_V1,
  subject: '0b9f8e7d-6c5b-4a49-8382-716051403928',
  time: '2026-10-09T15:00:00.000Z',
  datacontenttype: 'application/json',
  data: {
    entryId: '0b9f8e7d-6c5b-4a49-8382-716051403928',
    merchantId: '6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f',
    pointOfSaleId: null,
    entryType: 'CREDIT',
    amountInCents: 15_990,
    currency: 'BRL',
    businessDate: '2026-10-09',
  },
};

describe('ledger events v1', () => {
  it('accepts a valid EntryRecorded event', () => {
    expect(isLedgerEventV1(recorded)).toBe(true);
  });

  it('accepts a valid EntryReversed event', () => {
    const reversed = {
      ...recorded,
      type: ENTRY_REVERSED_V1,
      data: { ...recorded.data, reversedEntryId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' },
    };

    expect(isLedgerEventV1(reversed)).toBe(true);
  });

  it('rejects an EntryReversed event without the reversed entry', () => {
    expect(isLedgerEventV1({ ...recorded, type: ENTRY_REVERSED_V1 })).toBe(false);
  });

  it.each([
    ['unknown type', { ...recorded, type: 'cashflow.ledger.entry.deleted.v1' }],
    ['non positive amount', { ...recorded, data: { ...recorded.data, amountInCents: 0 } }],
    [
      'invalid business date',
      { ...recorded, data: { ...recorded.data, businessDate: '2026-13-01' } },
    ],
    ['unexpected field', { ...recorded, data: { ...recorded.data, note: 'x' } }],
    ['missing id', { ...recorded, id: undefined }],
  ])('rejects an event with %s', (_case, event) => {
    expect(isLedgerEventV1(event)).toBe(false);
  });

  it('describes validation errors', () => {
    const errors = describeLedgerEventErrors({
      ...recorded,
      data: { ...recorded.data, amountInCents: 0 },
    });

    expect(errors.join('\n')).toContain('/data/amountInCents');
  });
});

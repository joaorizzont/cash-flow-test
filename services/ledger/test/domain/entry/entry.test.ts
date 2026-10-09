import { describe, expect, it } from 'vitest';
import {
  Description,
  Entry,
  EntryId,
  EntryType,
  PointOfSaleId,
  ReversalOfReversalError,
} from '../../../src/domain/index.js';
import {
  ENTRY_ID,
  MERCHANT_ID,
  NOW,
  POINT_OF_SALE_ID,
  recordedEntry,
  TODAY,
} from '../../support/entry-fixtures.js';
import { NORONHA } from '../../support/time-zones.js';

const REVERSAL_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const REVERSED_AT = new Date('2026-10-10T12:00:00.000Z');

const reverse = (entry: ReturnType<typeof recordedEntry>) =>
  entry.reverse({
    id: EntryId.from(REVERSAL_ID),
    description: Description.from('Customer refund'),
    recordedAt: REVERSED_AT,
  });

describe('Entry', () => {
  it('records a new entry and raises EntryRecorded', () => {
    const entry = recordedEntry();

    expect(entry.isReversal()).toBe(false);
    expect(entry.pullDomainEvents()).toEqual([
      {
        name: 'EntryRecorded',
        entryId: ENTRY_ID,
        merchantId: MERCHANT_ID,
        pointOfSaleId: null,
        entryType: EntryType.CREDIT,
        amountInCents: 15_990,
        currency: 'BRL',
        businessDate: TODAY,
        occurredAt: NOW,
      },
    ]);
  });

  it('clears domain events once pulled', () => {
    const entry = recordedEntry();
    entry.pullDomainEvents();

    expect(entry.pullDomainEvents()).toEqual([]);
  });

  it('reverses an entry keeping its business date, point of sale and time zone', () => {
    const original = recordedEntry({
      type: EntryType.DEBIT,
      pointOfSaleId: PointOfSaleId.from(POINT_OF_SALE_ID),
      timeZone: NORONHA,
    });

    const reversal = reverse(original);

    expect(reversal.type).toBe(EntryType.CREDIT);
    expect(reversal.amount.equals(original.amount)).toBe(true);
    expect(reversal.businessDate.equals(original.businessDate)).toBe(true);
    expect(reversal.pointOfSaleId?.equals(PointOfSaleId.from(POINT_OF_SALE_ID))).toBe(true);
    expect(reversal.timeZone.equals(NORONHA)).toBe(true);
    expect(reversal.reversalOf?.value).toBe(ENTRY_ID);
    expect(reversal.recordedAt).toEqual(REVERSED_AT);
    expect(reversal.isReversal()).toBe(true);
  });

  it('raises EntryReversed for the reversal', () => {
    const reversal = reverse(recordedEntry());

    expect(reversal.pullDomainEvents()).toEqual([
      expect.objectContaining({
        name: 'EntryReversed',
        entryId: REVERSAL_ID,
        reversedEntryId: ENTRY_ID,
        entryType: EntryType.DEBIT,
        amountInCents: 15_990,
        occurredAt: REVERSED_AT,
      }),
    ]);
  });

  it('does not allow reversing a reversal', () => {
    const reversal = reverse(recordedEntry());

    expect(() => reverse(reversal)).toThrow(ReversalOfReversalError);
  });
});

describe('Entry.restore', () => {
  it('rehydrates an existing entry without raising events', () => {
    const original = recordedEntry();
    const restored = Entry.restore({
      id: original.id,
      merchantId: original.merchantId,
      pointOfSaleId: original.pointOfSaleId,
      type: original.type,
      amount: original.amount,
      businessDate: original.businessDate,
      description: original.description,
      reversalOf: EntryId.from(REVERSAL_ID),
      recordedAt: original.recordedAt,
      timeZone: original.timeZone,
    });

    expect(restored.isReversal()).toBe(true);
    expect(restored.id.toString()).toBe(ENTRY_ID);
    expect(restored.pullDomainEvents()).toEqual([]);
  });
});

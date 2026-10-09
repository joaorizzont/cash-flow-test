import { randomUUID } from 'node:crypto';
import {
  ENTRY_RECORDED_V1,
  ENTRY_REVERSED_V1,
  LEDGER_EVENT_SOURCE,
  type EntryRecordedV1,
  type EntryReversedV1,
} from '@cash-flow/contracts';
import type { ConsolidateMovementCommand } from '../../src/application/index.js';
import {
  BusinessDate,
  DailyBalance,
  EntryId,
  EntryType,
  MerchantId,
  Money,
  type Movement,
} from '../../src/domain/index.js';

export const MERCHANT_ID = '6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f';
export const OTHER_MERCHANT_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const BUSINESS_DATE = '2026-10-09';

export const movement = (overrides: Partial<Movement> = {}): Movement => ({
  entryId: EntryId.from(randomUUID()),
  merchantId: MerchantId.from(MERCHANT_ID),
  businessDate: BusinessDate.from(BUSINESS_DATE),
  type: EntryType.CREDIT,
  amount: Money.of(10_000),
  ...overrides,
});

export const consolidateCommand = (
  overrides: Partial<ConsolidateMovementCommand> = {},
): ConsolidateMovementCommand => ({
  eventId: randomUUID(),
  eventType: ENTRY_RECORDED_V1,
  occurredAt: new Date('2026-10-09T15:00:00.000Z'),
  entryId: randomUUID(),
  merchantId: MERCHANT_ID,
  businessDate: BUSINESS_DATE,
  entryType: 'CREDIT',
  amountInCents: 10_000,
  currency: 'BRL',
  ...overrides,
});

export const entryRecordedEvent = (
  data: Partial<EntryRecordedV1['data']> = {},
): EntryRecordedV1 => {
  const entryId = data.entryId ?? randomUUID();
  return {
    specversion: '1.0',
    id: randomUUID(),
    source: LEDGER_EVENT_SOURCE,
    type: ENTRY_RECORDED_V1,
    subject: entryId,
    time: '2026-10-09T15:00:00.000Z',
    datacontenttype: 'application/json',
    data: {
      entryId,
      merchantId: MERCHANT_ID,
      pointOfSaleId: null,
      entryType: 'CREDIT',
      amountInCents: 10_000,
      currency: 'BRL',
      businessDate: BUSINESS_DATE,
      ...data,
    },
  };
};

export const entryReversedEvent = (reversedEntryId: string): EntryReversedV1 => {
  const recorded = entryRecordedEvent({ entryType: 'DEBIT' });
  return {
    ...recorded,
    type: ENTRY_REVERSED_V1,
    data: { ...recorded.data, reversedEntryId },
  };
};

export const dailyBalance = (
  businessDate: string,
  totals: { credits: number; debits: number; count?: number },
  merchantId: string = MERCHANT_ID,
): DailyBalance =>
  DailyBalance.restore({
    merchantId: MerchantId.from(merchantId),
    businessDate: BusinessDate.from(businessDate),
    totalCreditsInCents: totals.credits,
    totalDebitsInCents: totals.debits,
    entryCount: totals.count ?? 1,
  });

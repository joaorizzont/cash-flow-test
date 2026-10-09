import {
  BusinessDate,
  Description,
  Entry,
  EntryId,
  EntryType,
  MerchantId,
  Money,
  type NewEntryProps,
} from '../../src/domain/index.js';

export const MERCHANT_ID = '6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f';
export const OTHER_MERCHANT_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const ENTRY_ID = '0b9f8e7d-6c5b-4a49-8382-716051403928';
export const NOW = new Date('2026-10-09T15:00:00.000Z');
export const TODAY = '2026-10-09';

export const newEntryProps = (overrides: Partial<NewEntryProps> = {}): NewEntryProps => ({
  id: EntryId.from(ENTRY_ID),
  merchantId: MerchantId.from(MERCHANT_ID),
  type: EntryType.CREDIT,
  amount: Money.of(15_990),
  businessDate: BusinessDate.from(TODAY),
  description: Description.from('Sale #1024'),
  recordedAt: NOW,
  ...overrides,
});

export const recordedEntry = (overrides: Partial<NewEntryProps> = {}): Entry =>
  Entry.record(newEntryProps(overrides));

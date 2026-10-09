import { describe, expect, it } from 'vitest';
import {
  BusinessDate,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  ValidationError,
} from '../../../src/domain/index.js';

describe('BusinessDate', () => {
  it('accepts a calendar date', () => {
    expect(BusinessDate.from('2028-02-29').value).toBe('2028-02-29');
  });

  it.each(['2026-02-30', '2026-13-01', '09/10/2026', '2026-10-09T00:00:00Z'])(
    'rejects %s',
    (value) => {
      expect(() => BusinessDate.from(value)).toThrow(ValidationError);
    },
  );

  it('compares by value', () => {
    expect(BusinessDate.from('2026-10-09').equals(BusinessDate.from('2026-10-09'))).toBe(true);
  });
});

describe('Money', () => {
  it('accepts a positive amount in cents', () => {
    expect(Money.of(1)).toMatchObject({ cents: 1, currency: 'BRL' });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects %s cents', (cents) => {
    expect(() => Money.of(cents)).toThrow(ValidationError);
  });

  it('rejects an unsupported currency', () => {
    expect(() => Money.of(100, 'USD')).toThrow(ValidationError);
  });
});

describe('parseEntryType', () => {
  it('accepts credit and debit', () => {
    expect(parseEntryType('CREDIT')).toBe('CREDIT');
    expect(parseEntryType('DEBIT')).toBe('DEBIT');
  });

  it('rejects anything else', () => {
    expect(() => parseEntryType('credit')).toThrow(ValidationError);
  });
});

describe('identifiers', () => {
  it('normalizes to lowercase', () => {
    const value = 'B1C2D3E4-F5A6-4B7C-8D9E-0F1A2B3C4D5E';

    expect(EntryId.from(value).value).toBe(value.toLowerCase());
  });

  it('rejects an invalid uuid', () => {
    expect(() => MerchantId.from('merchant-1')).toThrow(ValidationError);
  });

  it('distinguishes identifier kinds with the same value', () => {
    const value = '6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f';

    expect(EntryId.from(value).equals(MerchantId.from(value))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BalanceOverflowError,
  BusinessDate,
  DailyBalance,
  EntryType,
  MerchantId,
  Money,
  MovementOutOfScopeError,
} from '../../../src/domain/index.js';
import { BUSINESS_DATE, MERCHANT_ID, movement, OTHER_MERCHANT_ID } from '../../support/fixtures.js';

const merchantId = MerchantId.from(MERCHANT_ID);
const businessDate = BusinessDate.from(BUSINESS_DATE);

describe('DailyBalance', () => {
  it('starts empty', () => {
    const balance = DailyBalance.empty(merchantId, businessDate);

    expect(balance).toMatchObject({
      totalCreditsInCents: 0,
      totalDebitsInCents: 0,
      balanceInCents: 0,
      entryCount: 0,
    });
  });

  it('adds credits and debits to their own totals', () => {
    const balance = DailyBalance.empty(merchantId, businessDate)
      .apply(movement({ type: EntryType.CREDIT, amount: Money.of(15_000) }))
      .apply(movement({ type: EntryType.DEBIT, amount: Money.of(4_000) }))
      .apply(movement({ type: EntryType.CREDIT, amount: Money.of(1_000) }));

    expect(balance).toMatchObject({
      totalCreditsInCents: 16_000,
      totalDebitsInCents: 4_000,
      balanceInCents: 12_000,
      entryCount: 3,
    });
  });

  it('allows a negative balance when debits exceed credits', () => {
    const balance = DailyBalance.of(movement({ type: EntryType.DEBIT, amount: Money.of(500) }));

    expect(balance.balanceInCents).toBe(-500);
  });

  it('is immutable', () => {
    const empty = DailyBalance.empty(merchantId, businessDate);

    empty.apply(movement());

    expect(empty.entryCount).toBe(0);
  });

  it('builds a single movement delta', () => {
    const delta = DailyBalance.of(movement({ amount: Money.of(2_500) }));

    expect(delta).toMatchObject({ totalCreditsInCents: 2_500, entryCount: 1 });
    expect(delta.merchantId.value).toBe(MERCHANT_ID);
    expect(delta.businessDate.value).toBe(BUSINESS_DATE);
  });

  it('rebuilds from a list of movements', () => {
    const movements = [
      movement({ amount: Money.of(100) }),
      movement({ type: EntryType.DEBIT, amount: Money.of(30) }),
    ];

    const balance = DailyBalance.fromMovements(merchantId, businessDate, movements);

    expect(balance).toMatchObject({ balanceInCents: 70, entryCount: 2 });
  });

  it('rejects a movement of another merchant', () => {
    const empty = DailyBalance.empty(merchantId, businessDate);

    expect(() => empty.apply(movement({ merchantId: MerchantId.from(OTHER_MERCHANT_ID) }))).toThrow(
      MovementOutOfScopeError,
    );
  });

  it('rejects a movement of another day', () => {
    const empty = DailyBalance.empty(merchantId, businessDate);

    expect(() => empty.apply(movement({ businessDate: BusinessDate.from('2026-10-10') }))).toThrow(
      MovementOutOfScopeError,
    );
  });

  it('rejects totals beyond the safe integer range', () => {
    const almostFull = DailyBalance.restore({
      merchantId,
      businessDate,
      totalCreditsInCents: Number.MAX_SAFE_INTEGER,
      totalDebitsInCents: 0,
      entryCount: 1,
    });

    expect(() => almostFull.apply(movement({ amount: Money.of(1) }))).toThrow(BalanceOverflowError);
  });
});

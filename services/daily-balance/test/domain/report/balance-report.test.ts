import { describe, expect, it } from 'vitest';
import { BalanceReport, MerchantId, ReportPeriod } from '../../../src/domain/index.js';
import { dailyBalance, MERCHANT_ID } from '../../support/fixtures.js';

const merchantId = MerchantId.from(MERCHANT_ID);

describe('BalanceReport', () => {
  it('chains opening and closing balances day by day, filling days without movement', () => {
    const report = BalanceReport.compose({
      merchantId,
      period: ReportPeriod.parse('2026-10-07', '2026-10-09'),
      openingBalanceInCents: 1_000,
      balances: [
        dailyBalance('2026-10-07', { credits: 5_000, debits: 2_000, count: 3 }),
        dailyBalance('2026-10-09', { credits: 0, debits: 4_500, count: 1 }),
      ],
    });

    expect(
      report.lines.map((line) => ({
        date: line.balance.businessDate.value,
        balance: line.balance.balanceInCents,
        opening: line.openingBalanceInCents,
        closing: line.closingBalanceInCents,
      })),
    ).toEqual([
      { date: '2026-10-07', balance: 3_000, opening: 1_000, closing: 4_000 },
      { date: '2026-10-08', balance: 0, opening: 4_000, closing: 4_000 },
      { date: '2026-10-09', balance: -4_500, opening: 4_000, closing: -500 },
    ]);
  });

  it('summarizes the period', () => {
    const report = BalanceReport.compose({
      merchantId,
      period: ReportPeriod.parse('2026-10-07', '2026-10-08'),
      openingBalanceInCents: 200,
      balances: [
        dailyBalance('2026-10-07', { credits: 1_000, debits: 300, count: 2 }),
        dailyBalance('2026-10-08', { credits: 500, debits: 100, count: 3 }),
      ],
    });

    expect(report).toMatchObject({
      openingBalanceInCents: 200,
      totalCreditsInCents: 1_500,
      totalDebitsInCents: 400,
      netChangeInCents: 1_100,
      closingBalanceInCents: 1_300,
      entryCount: 5,
    });
  });

  it('reports zero for a period without movement', () => {
    const report = BalanceReport.compose({
      merchantId,
      period: ReportPeriod.parse('2026-10-09', '2026-10-09'),
      openingBalanceInCents: 0,
      balances: [],
    });

    expect(report.lines).toHaveLength(1);
    expect(report.closingBalanceInCents).toBe(0);
  });
});

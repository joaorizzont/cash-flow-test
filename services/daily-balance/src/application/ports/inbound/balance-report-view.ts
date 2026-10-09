import type { BalanceReport, DailyBalanceLine } from '../../../domain/index.js';

export interface DailyBalanceLineView {
  readonly businessDate: string;
  readonly totalCreditsInCents: number;
  readonly totalDebitsInCents: number;
  readonly balanceInCents: number;
  readonly entryCount: number;
  readonly openingBalanceInCents: number;
  readonly closingBalanceInCents: number;
}

export interface BalanceReportView {
  readonly merchantId: string;
  readonly from: string;
  readonly to: string;
  readonly openingBalanceInCents: number;
  readonly closingBalanceInCents: number;
  readonly totalCreditsInCents: number;
  readonly totalDebitsInCents: number;
  readonly netChangeInCents: number;
  readonly entryCount: number;
  readonly days: readonly DailyBalanceLineView[];
  readonly generatedAt: string;
}

const toLineView = (line: DailyBalanceLine): DailyBalanceLineView => ({
  businessDate: line.balance.businessDate.value,
  totalCreditsInCents: line.balance.totalCreditsInCents,
  totalDebitsInCents: line.balance.totalDebitsInCents,
  balanceInCents: line.balance.balanceInCents,
  entryCount: line.balance.entryCount,
  openingBalanceInCents: line.openingBalanceInCents,
  closingBalanceInCents: line.closingBalanceInCents,
});

export const toBalanceReportView = (
  report: BalanceReport,
  generatedAt: Date,
): BalanceReportView => ({
  merchantId: report.merchantId.value,
  from: report.period.from.value,
  to: report.period.to.value,
  openingBalanceInCents: report.openingBalanceInCents,
  closingBalanceInCents: report.closingBalanceInCents,
  totalCreditsInCents: report.totalCreditsInCents,
  totalDebitsInCents: report.totalDebitsInCents,
  netChangeInCents: report.netChangeInCents,
  entryCount: report.entryCount,
  days: report.lines.map(toLineView),
  generatedAt: generatedAt.toISOString(),
});

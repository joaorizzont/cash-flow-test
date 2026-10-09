import { DailyBalance } from '../balance/daily-balance.js';
import type { MerchantId } from '../shared/merchant-id.js';
import type { ReportPeriod } from './report-period.js';

export interface DailyBalanceLine {
  readonly balance: DailyBalance;
  readonly openingBalanceInCents: number;
  readonly closingBalanceInCents: number;
}

export interface BalanceReportInput {
  readonly merchantId: MerchantId;
  readonly period: ReportPeriod;
  readonly openingBalanceInCents: number;
  readonly balances: readonly DailyBalance[];
}

const sumOf = (lines: readonly DailyBalanceLine[], pick: (balance: DailyBalance) => number) =>
  lines.reduce((total, line) => total + pick(line.balance), 0);

export class BalanceReport {
  readonly merchantId: MerchantId;
  readonly period: ReportPeriod;
  readonly openingBalanceInCents: number;

  private constructor(
    input: BalanceReportInput,
    readonly lines: readonly DailyBalanceLine[],
  ) {
    this.merchantId = input.merchantId;
    this.period = input.period;
    this.openingBalanceInCents = input.openingBalanceInCents;
  }

  static compose(input: BalanceReportInput): BalanceReport {
    const byDate = new Map(input.balances.map((balance) => [balance.businessDate.value, balance]));
    const lines: DailyBalanceLine[] = [];
    let running = input.openingBalanceInCents;
    for (const day of input.period.days()) {
      const balance = byDate.get(day.value) ?? DailyBalance.empty(input.merchantId, day);
      const closing = running + balance.balanceInCents;
      lines.push({ balance, openingBalanceInCents: running, closingBalanceInCents: closing });
      running = closing;
    }
    return new BalanceReport(input, lines);
  }

  get closingBalanceInCents(): number {
    return this.openingBalanceInCents + this.netChangeInCents;
  }

  get totalCreditsInCents(): number {
    return sumOf(this.lines, (balance) => balance.totalCreditsInCents);
  }

  get totalDebitsInCents(): number {
    return sumOf(this.lines, (balance) => balance.totalDebitsInCents);
  }

  get netChangeInCents(): number {
    return sumOf(this.lines, (balance) => balance.balanceInCents);
  }

  get entryCount(): number {
    return sumOf(this.lines, (balance) => balance.entryCount);
  }
}

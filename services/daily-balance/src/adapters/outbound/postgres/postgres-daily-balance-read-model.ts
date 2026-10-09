import type { DailyBalanceReadModel } from '../../../application/index.js';
import {
  BusinessDate,
  DailyBalance,
  MerchantId,
  type ReportPeriod,
} from '../../../domain/index.js';
import type { Queryable } from './postgres-database.js';

interface DailyBalanceRow {
  readonly merchant_id: string;
  readonly business_date: string;
  readonly total_credits_cents: number;
  readonly total_debits_cents: number;
  readonly entry_count: number;
}

const toDailyBalance = (row: DailyBalanceRow): DailyBalance =>
  DailyBalance.restore({
    merchantId: MerchantId.from(row.merchant_id),
    businessDate: BusinessDate.from(row.business_date),
    totalCreditsInCents: row.total_credits_cents,
    totalDebitsInCents: row.total_debits_cents,
    entryCount: row.entry_count,
  });

export class PostgresDailyBalanceReadModel implements DailyBalanceReadModel {
  constructor(private readonly database: Queryable) {}

  async balancesIn(merchantId: MerchantId, period: ReportPeriod): Promise<readonly DailyBalance[]> {
    const result = await this.database.query<DailyBalanceRow>(
      `SELECT merchant_id, business_date, total_credits_cents, total_debits_cents, entry_count
       FROM daily_balances
       WHERE merchant_id = $1 AND business_date BETWEEN $2 AND $3
       ORDER BY business_date`,
      [merchantId.value, period.from.value, period.to.value],
    );
    return result.rows.map(toDailyBalance);
  }

  async accumulatedBalanceBefore(merchantId: MerchantId, date: BusinessDate): Promise<number> {
    const result = await this.database.query<{ total: number }>(
      `SELECT coalesce(sum(balance_cents), 0)::bigint AS total
       FROM daily_balances
       WHERE merchant_id = $1 AND business_date < $2`,
      [merchantId.value, date.value],
    );
    return result.rows[0]?.total ?? 0;
  }
}

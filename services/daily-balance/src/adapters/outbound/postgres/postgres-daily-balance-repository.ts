import type { DailyBalanceRepository } from '../../../application/index.js';
import type { BusinessDate, DailyBalance, MerchantId } from '../../../domain/index.js';
import type { Queryable } from './postgres-database.js';

const valuesOf = (balance: DailyBalance): readonly unknown[] => [
  balance.merchantId.value,
  balance.businessDate.value,
  balance.totalCreditsInCents,
  balance.totalDebitsInCents,
  balance.entryCount,
];

export class PostgresDailyBalanceRepository implements DailyBalanceRepository {
  constructor(private readonly database: Queryable) {}

  async accumulate(delta: DailyBalance): Promise<void> {
    await this.database.query(
      `INSERT INTO daily_balances
         (merchant_id, business_date, total_credits_cents, total_debits_cents, entry_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id, business_date) DO UPDATE SET
         total_credits_cents = daily_balances.total_credits_cents + EXCLUDED.total_credits_cents,
         total_debits_cents = daily_balances.total_debits_cents + EXCLUDED.total_debits_cents,
         entry_count = daily_balances.entry_count + EXCLUDED.entry_count,
         updated_at = now()`,
      valuesOf(delta),
    );
  }

  async lock(merchantId: MerchantId, businessDate: BusinessDate): Promise<void> {
    const key = [merchantId.value, businessDate.value];
    await this.database.query(
      `INSERT INTO daily_balances (merchant_id, business_date) VALUES ($1, $2)
       ON CONFLICT (merchant_id, business_date) DO NOTHING`,
      key,
    );
    await this.database.query(
      'SELECT 1 FROM daily_balances WHERE merchant_id = $1 AND business_date = $2 FOR UPDATE',
      key,
    );
  }

  async replace(balance: DailyBalance): Promise<void> {
    await this.database.query(
      `INSERT INTO daily_balances
         (merchant_id, business_date, total_credits_cents, total_debits_cents, entry_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id, business_date) DO UPDATE SET
         total_credits_cents = EXCLUDED.total_credits_cents,
         total_debits_cents = EXCLUDED.total_debits_cents,
         entry_count = EXCLUDED.entry_count,
         updated_at = now()`,
      valuesOf(balance),
    );
  }
}

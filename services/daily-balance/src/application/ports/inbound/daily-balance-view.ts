import type { DailyBalance } from '../../../domain/index.js';

export interface DailyBalanceView {
  readonly merchantId: string;
  readonly businessDate: string;
  readonly totalCreditsInCents: number;
  readonly totalDebitsInCents: number;
  readonly balanceInCents: number;
  readonly entryCount: number;
}

export const toDailyBalanceView = (balance: DailyBalance): DailyBalanceView => ({
  merchantId: balance.merchantId.value,
  businessDate: balance.businessDate.value,
  totalCreditsInCents: balance.totalCreditsInCents,
  totalDebitsInCents: balance.totalDebitsInCents,
  balanceInCents: balance.balanceInCents,
  entryCount: balance.entryCount,
});

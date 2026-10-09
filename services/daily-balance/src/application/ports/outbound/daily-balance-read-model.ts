import type {
  BusinessDate,
  DailyBalance,
  MerchantId,
  ReportPeriod,
} from '../../../domain/index.js';

export interface DailyBalanceReadModel {
  balancesIn(merchantId: MerchantId, period: ReportPeriod): Promise<readonly DailyBalance[]>;
  accumulatedBalanceBefore(merchantId: MerchantId, date: BusinessDate): Promise<number>;
}

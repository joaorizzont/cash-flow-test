import type { BusinessDate, DailyBalance, MerchantId } from '../../../domain/index.js';

export interface DailyBalanceRepository {
  accumulate(delta: DailyBalance): Promise<void>;
  lock(merchantId: MerchantId, businessDate: BusinessDate): Promise<void>;
  replace(balance: DailyBalance): Promise<void>;
  find(merchantId: MerchantId, businessDate: BusinessDate): Promise<DailyBalance | null>;
}

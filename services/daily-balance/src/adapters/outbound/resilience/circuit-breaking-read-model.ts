import type { DailyBalanceReadModel } from '../../../application/index.js';
import type {
  BusinessDate,
  DailyBalance,
  MerchantId,
  ReportPeriod,
} from '../../../domain/index.js';
import type { CircuitBreaker } from './circuit-breaker.js';

export class CircuitBreakingReadModel implements DailyBalanceReadModel {
  constructor(
    private readonly origin: DailyBalanceReadModel,
    private readonly breaker: CircuitBreaker,
  ) {}

  balancesIn(merchantId: MerchantId, period: ReportPeriod): Promise<readonly DailyBalance[]> {
    return this.breaker.execute(() => this.origin.balancesIn(merchantId, period));
  }

  accumulatedBalanceBefore(merchantId: MerchantId, date: BusinessDate): Promise<number> {
    return this.breaker.execute(() => this.origin.accumulatedBalanceBefore(merchantId, date));
  }
}

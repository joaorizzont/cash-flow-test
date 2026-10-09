import type { DailyBalanceReadModel } from '../../src/application/index.js';
import type {
  BusinessDate,
  DailyBalance,
  MerchantId,
  ReportPeriod,
} from '../../src/domain/index.js';

export class InMemoryReadModel implements DailyBalanceReadModel {
  private readonly balances: DailyBalance[] = [];
  failure: Error | null = null;
  reads = 0;

  add(...balances: readonly DailyBalance[]): void {
    this.balances.push(...balances);
  }

  async balancesIn(merchantId: MerchantId, period: ReportPeriod): Promise<readonly DailyBalance[]> {
    this.ensureAvailable();
    return this.ofMerchant(merchantId).filter(
      (balance) =>
        balance.businessDate.value >= period.from.value &&
        balance.businessDate.value <= period.to.value,
    );
  }

  async accumulatedBalanceBefore(merchantId: MerchantId, date: BusinessDate): Promise<number> {
    this.ensureAvailable();
    return this.ofMerchant(merchantId)
      .filter((balance) => balance.businessDate.value < date.value)
      .reduce((total, balance) => total + balance.balanceInCents, 0);
  }

  private ofMerchant(merchantId: MerchantId): readonly DailyBalance[] {
    return this.balances.filter((balance) => balance.merchantId.equals(merchantId));
  }

  private ensureAvailable(): void {
    this.reads += 1;
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

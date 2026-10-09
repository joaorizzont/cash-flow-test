import type { DailyBalanceRepository } from '../../src/application/index.js';
import { DailyBalance, type BusinessDate, type MerchantId } from '../../src/domain/index.js';

const keyOf = (merchantId: MerchantId, businessDate: BusinessDate): string =>
  `${merchantId.value}/${businessDate.value}`;

export class InMemoryDailyBalanceRepository implements DailyBalanceRepository {
  private readonly balances = new Map<string, DailyBalance>();
  readonly locks: string[] = [];

  async accumulate(delta: DailyBalance): Promise<void> {
    const key = keyOf(delta.merchantId, delta.businessDate);
    const current = this.balances.get(key);
    this.balances.set(
      key,
      current === undefined
        ? delta
        : DailyBalance.restore({
            merchantId: current.merchantId,
            businessDate: current.businessDate,
            totalCreditsInCents: current.totalCreditsInCents + delta.totalCreditsInCents,
            totalDebitsInCents: current.totalDebitsInCents + delta.totalDebitsInCents,
            entryCount: current.entryCount + delta.entryCount,
          }),
    );
  }

  async lock(merchantId: MerchantId, businessDate: BusinessDate): Promise<void> {
    this.locks.push(keyOf(merchantId, businessDate));
  }

  async replace(balance: DailyBalance): Promise<void> {
    this.balances.set(keyOf(balance.merchantId, balance.businessDate), balance);
  }

  async balanceOf(
    merchantId: MerchantId,
    businessDate: BusinessDate,
  ): Promise<DailyBalance | null> {
    return this.balances.get(keyOf(merchantId, businessDate)) ?? null;
  }
}

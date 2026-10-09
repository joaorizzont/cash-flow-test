import { BusinessDate, DailyBalance, MerchantId } from '../../domain/index.js';
import { toDailyBalanceView, type DailyBalanceView } from '../ports/inbound/daily-balance-view.js';
import type {
  RebuildDailyBalance,
  RebuildDailyBalanceCommand,
} from '../ports/inbound/rebuild-daily-balance.js';
import type { DailyBalanceRepository } from '../ports/outbound/daily-balance-repository.js';
import type { MovementJournal } from '../ports/outbound/movement-journal.js';
import type { TransactionRunner } from '../ports/outbound/transaction-runner.js';

export interface RebuildDailyBalanceDependencies {
  readonly journal: MovementJournal;
  readonly balances: DailyBalanceRepository;
  readonly transactions: TransactionRunner;
}

export class RebuildDailyBalanceService implements RebuildDailyBalance {
  constructor(private readonly dependencies: RebuildDailyBalanceDependencies) {}

  async execute(command: RebuildDailyBalanceCommand): Promise<DailyBalanceView> {
    const merchantId = MerchantId.from(command.merchantId);
    const businessDate = BusinessDate.from(command.businessDate);
    const { journal, balances, transactions } = this.dependencies;

    return transactions.run(async () => {
      await balances.lock(merchantId, businessDate);
      const movements = await journal.movementsOf(merchantId, businessDate);
      const rebuilt = DailyBalance.fromMovements(merchantId, businessDate, movements);
      await balances.replace(rebuilt);
      return toDailyBalanceView(rebuilt);
    });
  }
}

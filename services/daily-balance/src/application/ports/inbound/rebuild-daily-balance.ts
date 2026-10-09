import type { DailyBalanceView } from './daily-balance-view.js';

export interface RebuildDailyBalanceCommand {
  readonly merchantId: string;
  readonly businessDate: string;
}

export interface RebuildDailyBalance {
  execute(command: RebuildDailyBalanceCommand): Promise<DailyBalanceView>;
}

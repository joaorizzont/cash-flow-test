import type { PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresDailyBalanceRepository } from './adapters/outbound/postgres/postgres-daily-balance-repository.js';
import { PostgresMovementJournal } from './adapters/outbound/postgres/postgres-movement-journal.js';
import {
  ConsolidateMovementService,
  RebuildDailyBalanceService,
  type ConsolidateMovement,
  type RebuildDailyBalance,
} from './application/index.js';

export interface DailyBalanceUseCases {
  readonly consolidateMovement: ConsolidateMovement;
  readonly rebuildDailyBalance: RebuildDailyBalance;
}

export const createDailyBalanceUseCases = (database: PostgresDatabase): DailyBalanceUseCases => {
  const dependencies = {
    journal: new PostgresMovementJournal(database),
    balances: new PostgresDailyBalanceRepository(database),
    transactions: database,
  };
  return {
    consolidateMovement: new ConsolidateMovementService(dependencies),
    rebuildDailyBalance: new RebuildDailyBalanceService(dependencies),
  };
};

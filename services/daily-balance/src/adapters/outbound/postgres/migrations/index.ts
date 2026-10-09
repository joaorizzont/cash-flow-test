import { createDailyBalances } from './0001-create-daily-balances.js';
import { createAppliedMovements } from './0002-create-applied-movements.js';
import type { Migration } from './migration.js';

export type { Migration } from './migration.js';

export const dailyBalanceMigrations: readonly Migration[] = [
  createDailyBalances,
  createAppliedMovements,
];

import type { GetBalanceReport } from '../../../application/index.js';

export interface DailyBalanceApi {
  readonly getBalanceReport: GetBalanceReport;
}

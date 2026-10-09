import type { BalanceReportView } from './balance-report-view.js';

export interface BalanceReportQuery {
  readonly merchantId: string;
  readonly from: string;
  readonly to: string;
}

export const ReportSource = {
  DATABASE: 'DATABASE',
  CACHE: 'CACHE',
  STALE_CACHE: 'STALE_CACHE',
} as const;

export type ReportSource = (typeof ReportSource)[keyof typeof ReportSource];

export interface BalanceReportResult {
  readonly report: BalanceReportView;
  readonly source: ReportSource;
}

export interface GetBalanceReport {
  execute(query: BalanceReportQuery): Promise<BalanceReportResult>;
}

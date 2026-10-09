import type { BalanceReportView } from '../inbound/balance-report-view.js';

export interface CachedReportEntry {
  readonly report: BalanceReportView;
  readonly cachedAt: string;
}

export interface BalanceReportCache {
  get(key: string): Promise<CachedReportEntry | null>;
  set(key: string, entry: CachedReportEntry): Promise<void>;
}

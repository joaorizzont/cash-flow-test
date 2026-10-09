import type { BalanceReportCache, CachedReportEntry } from '../../src/application/index.js';

export class InMemoryReportCache implements BalanceReportCache {
  readonly entries = new Map<string, CachedReportEntry>();

  async get(key: string): Promise<CachedReportEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, entry: CachedReportEntry): Promise<void> {
    this.entries.set(key, entry);
  }
}

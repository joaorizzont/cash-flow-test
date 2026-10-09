import { DomainError } from '../../domain/index.js';
import { BalanceReportUnavailableError } from '../errors/balance-report-unavailable-error.js';
import {
  ReportSource,
  type BalanceReportQuery,
  type BalanceReportResult,
  type GetBalanceReport,
} from '../ports/inbound/get-balance-report.js';
import type {
  BalanceReportCache,
  CachedReportEntry,
} from '../ports/outbound/balance-report-cache.js';
import type { Clock } from '../ports/outbound/clock.js';
import { parseBalanceReportQuery } from '../use-cases/get-balance-report-service.js';

export interface CachedBalanceReportOptions {
  readonly origin: GetBalanceReport;
  readonly cache: BalanceReportCache;
  readonly clock: Clock;
  readonly freshForMs: number;
}

const cacheKeyOf = (query: BalanceReportQuery): string => {
  const { merchantId, period } = parseBalanceReportQuery(query);
  return `daily-balance:report:v1:${merchantId.value}:${period.from.value}:${period.to.value}`;
};

export class CachedBalanceReport implements GetBalanceReport {
  private readonly inFlight = new Map<string, Promise<BalanceReportResult>>();

  constructor(private readonly options: CachedBalanceReportOptions) {}

  async execute(query: BalanceReportQuery): Promise<BalanceReportResult> {
    const key = cacheKeyOf(query);
    const cached = await this.options.cache.get(key);
    if (cached !== null && this.isFresh(cached)) {
      return { report: cached.report, source: ReportSource.CACHE };
    }
    try {
      return await this.loadOnce(key, query);
    } catch (error) {
      return this.fallback(error, cached);
    }
  }

  private loadOnce(key: string, query: BalanceReportQuery): Promise<BalanceReportResult> {
    const pending = this.inFlight.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const loading = this.load(key, query).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, loading);
    return loading;
  }

  private async load(key: string, query: BalanceReportQuery): Promise<BalanceReportResult> {
    const result = await this.options.origin.execute(query);
    await this.options.cache.set(key, {
      report: result.report,
      cachedAt: this.options.clock.now().toISOString(),
    });
    return result;
  }

  private fallback(error: unknown, cached: CachedReportEntry | null): BalanceReportResult {
    if (error instanceof DomainError) {
      throw error;
    }
    if (cached === null) {
      throw new BalanceReportUnavailableError();
    }
    return { report: cached.report, source: ReportSource.STALE_CACHE };
  }

  private isFresh(entry: CachedReportEntry): boolean {
    const age = this.options.clock.now().getTime() - Date.parse(entry.cachedAt);
    return age >= 0 && age < this.options.freshForMs;
  }
}

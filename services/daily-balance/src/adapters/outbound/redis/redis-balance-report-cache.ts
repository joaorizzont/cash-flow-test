import type { BalanceReportCache, CachedReportEntry } from '../../../application/index.js';
import { CircuitOpenError, type CircuitBreaker } from '../resilience/circuit-breaker.js';

export interface KeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export interface CacheLogger {
  warn(context: object, message: string): void;
}

export interface RedisBalanceReportCacheOptions {
  readonly client: KeyValueClient;
  readonly breaker: CircuitBreaker;
  readonly ttlSeconds: number;
  readonly logger: CacheLogger;
}

export class RedisBalanceReportCache implements BalanceReportCache {
  constructor(private readonly options: RedisBalanceReportCacheOptions) {}

  async get(key: string): Promise<CachedReportEntry | null> {
    const { client, breaker } = this.options;
    try {
      const value = await breaker.execute(() => client.get(key));
      return value === null ? null : (JSON.parse(value) as CachedReportEntry);
    } catch (error) {
      this.report(error, 'read');
      return null;
    }
  }

  async set(key: string, entry: CachedReportEntry): Promise<void> {
    const { client, breaker, ttlSeconds } = this.options;
    try {
      await breaker.execute(() => client.set(key, JSON.stringify(entry), { EX: ttlSeconds }));
    } catch (error) {
      this.report(error, 'write');
    }
  }

  private report(error: unknown, operation: string): void {
    if (!(error instanceof CircuitOpenError)) {
      this.options.logger.warn({ err: error, operation }, 'cache unavailable, bypassing it');
    }
  }
}

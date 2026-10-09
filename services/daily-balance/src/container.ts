import type { DailyBalanceApi } from './adapters/inbound/http/daily-balance-api.js';
import type {
  PostgresDatabase,
  Queryable,
} from './adapters/outbound/postgres/postgres-database.js';
import { PostgresDailyBalanceReadModel } from './adapters/outbound/postgres/postgres-daily-balance-read-model.js';
import { PostgresDailyBalanceRepository } from './adapters/outbound/postgres/postgres-daily-balance-repository.js';
import { PostgresMovementJournal } from './adapters/outbound/postgres/postgres-movement-journal.js';
import {
  RedisBalanceReportCache,
  type KeyValueClient,
} from './adapters/outbound/redis/redis-balance-report-cache.js';
import {
  CircuitBreaker,
  type CircuitState,
} from './adapters/outbound/resilience/circuit-breaker.js';
import { CircuitBreakerMetrics } from './adapters/outbound/resilience/circuit-breaker-metrics.js';
import { CircuitBreakingReadModel } from './adapters/outbound/resilience/circuit-breaking-read-model.js';
import { SystemClock } from './adapters/outbound/system/system-clock.js';
import {
  CachedBalanceReport,
  ConsolidateMovementService,
  GetBalanceReportService,
  RebuildDailyBalanceService,
  type Clock,
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

export interface ReportSettings {
  readonly databaseTimeoutMs: number;
  readonly cacheFreshForMs: number;
  readonly cacheStaleTtlSeconds: number;
  readonly cacheTimeoutMs: number;
  readonly circuitFailureThreshold: number;
  readonly circuitResetTimeoutMs: number;
}

export interface ApiLogger {
  warn(context: object, message: string): void;
}

export interface DailyBalanceApiDependencies {
  readonly database: Queryable;
  readonly cacheClient: KeyValueClient;
  readonly settings: ReportSettings;
  readonly logger: ApiLogger;
  readonly clock?: Clock;
}

export const createDailyBalanceApi = (
  dependencies: DailyBalanceApiDependencies,
): DailyBalanceApi => {
  const { database, cacheClient, settings, logger } = dependencies;
  const clock = dependencies.clock ?? new SystemClock();
  const breakerMetrics = new CircuitBreakerMetrics();
  const onStateChange = (circuit: string, state: CircuitState): void => {
    logger.warn({ circuit, state }, 'circuit breaker state changed');
    breakerMetrics.transitioned(circuit, state);
  };
  const breakerFor = (name: string, callTimeoutMs: number): CircuitBreaker => {
    const breaker = new CircuitBreaker({
      name,
      callTimeoutMs,
      failureThreshold: settings.circuitFailureThreshold,
      resetTimeoutMs: settings.circuitResetTimeoutMs,
      clock,
      onStateChange,
    });
    breakerMetrics.watch(name, breaker);
    return breaker;
  };

  const readModel = new CircuitBreakingReadModel(
    new PostgresDailyBalanceReadModel(database),
    breakerFor('postgres', settings.databaseTimeoutMs),
  );
  const cache = new RedisBalanceReportCache({
    client: cacheClient,
    breaker: breakerFor('redis', settings.cacheTimeoutMs),
    ttlSeconds: settings.cacheStaleTtlSeconds,
    logger,
  });

  return {
    getBalanceReport: new CachedBalanceReport({
      origin: new GetBalanceReportService({ readModel, clock }),
      cache,
      clock,
      freshForMs: settings.cacheFreshForMs,
    }),
  };
};

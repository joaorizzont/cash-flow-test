# ADR-0010: Cache with stale fallback and circuit breakers

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The report API must sustain 50 req/s with at most 5% loss. Its dependencies are its own PostgreSQL database and a cache. Any of them can be slow or down. A slow dependency is worse than a dead one: requests pile up holding connections until everything times out. At peak, many requests ask for the same report at the same time.

## Decision

The report use case is decorated with a **cache-aside** policy in the application layer, and the adapters are protected by **circuit breakers**:

| Mechanism                            | Behaviour                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh cache                          | Reports are kept in Redis; for `CACHE_FRESH_TTL_MS` (5 s) they are served as `x-cache: HIT`                                                                                                                                            |
| Stale-if-error                       | The same entry stays in Redis for `CACHE_STALE_TTL_SECONDS` (24 h). If the database fails, the last known report is returned as `x-cache: STALE` instead of an error                                                                   |
| Unavailable                          | With no cached report and the database down, the API answers `503` with `Retry-After`                                                                                                                                                  |
| Single flight                        | Concurrent identical misses share one database read, preventing a stampede when an entry expires at peak                                                                                                                               |
| Circuit breakers (Redis, PostgreSQL) | After `CIRCUIT_FAILURE_THRESHOLD` consecutive failures the circuit opens and calls fail immediately for `CIRCUIT_RESET_TIMEOUT_MS`; then a single trial call decides whether it closes                                                 |
| Timeouts                             | `CACHE_TIMEOUT_MS` (100 ms) per Redis call; `DATABASE_TIMEOUT_MS` (2 s) for connection and statement                                                                                                                                   |
| Best-effort cache port               | The cache adapter never throws: a Redis failure is a miss, so Redis is never a hard dependency                                                                                                                                         |
| Readiness                            | PostgreSQL and Redis are reported as non-critical in `/health/ready` of the API (`degraded`, still `200`). All replicas share them, so failing readiness would remove every replica at once and turn a degradation into a total outage |
| Pool error handling                  | Idle connections terminated by PostgreSQL no longer crash the process (found when testing the database outage, now covered by a regression test)                                                                                       |

The cache is not invalidated by events: the report is already eventually consistent, and keeping the consumer independent of Redis is worth an extra ≤ 5 s of staleness.

## Alternatives considered

| Alternative                       | Why it was not chosen                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Short TTL cache only              | The API would fail together with the database                                                                                                               |
| Invalidation on every event       | Couples the consumer to Redis and adds a failure mode to consolidation for little freshness gain                                                            |
| In-process memory cache           | Not shared between replicas; inconsistent answers across replicas                                                                                           |
| `opossum` circuit breaker library | More complete (rolling windows, events), but the scope needs about 80 lines; an own implementation with an injectable clock is fully deterministic in tests |
| Timeouts without circuit breakers | Every request would still wait for the timeout during an outage                                                                                             |
| Distributed lock against stampede | Unnecessary at this volume; per-process single flight is enough                                                                                             |

## Consequences

**Positive**

- Peak with Redis down for 30 s: 0% failures, p95 22 ms. Peak with the database down for 30 s: 0% failures, p95 8.3 ms, reports served as `STALE`.
- Responses tell clients where they came from (`x-cache`) and when they were computed (`generatedAt`).

**Negative / trade-offs**

- A report never computed before is unavailable while the database is down.
- Stale data can be served for up to 24 h during a long database outage; this is surfaced by the `StaleBalanceReportsServed` alert.
- Circuit state is per process, not shared between replicas.

## Evidence

- Cache policy: [cached-balance-report.ts](../../services/daily-balance/src/application/services/cached-balance-report.ts)
- Circuit breaker: [circuit-breaker.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaker.ts), [circuit-breaking-read-model.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaking-read-model.ts)
- Redis adapter: [redis-balance-report-cache.ts](../../services/daily-balance/src/adapters/outbound/redis/redis-balance-report-cache.ts), [redis-connection.ts](../../services/daily-balance/src/adapters/outbound/redis/redis-connection.ts)
- Readiness: [health-routes.ts](../../services/daily-balance/src/adapters/inbound/http/routes/health-routes.ts), [main.ts](../../services/daily-balance/src/main.ts)
- Load tests with outages: [dependency-outage-under-load.mjs](../../tests/resilience/dependency-outage-under-load.mjs)

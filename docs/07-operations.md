# Operations, SLOs and runbooks

This document complements the README sections "Observabilidade", "Resiliência" and "Testes de carga e resiliência". It defines the service level objectives, a runbook for each alert, backup and disaster recovery, and day-to-day operating practices.

## Service level indicators and objectives

| SLO                           | SLI and measurement                                                                                                                                                                                                                                    | Target                                   | Error budget (30 days)                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------- |
| Ledger availability           | Share of ledger requests without `5xx`: `1 - sum(rate(http_server_request_duration_seconds_count{job="cash-flow/ledger",http_response_status_code=~"5.."}[30d])) / sum(rate(http_server_request_duration_seconds_count{job="cash-flow/ledger"}[30d]))` | 99.9%                                    | 0.1% of requests (~43 min of full outage) |
| Daily balance success at peak | Share of report requests without `5xx` or `429`, same formula with `job="cash-flow/daily-balance"` and `http_response_status_code=~"5..\|429"`                                                                                                         | 95% (requirement); 99.5% internal target | 0.5% of requests                          |
| Daily balance latency         | `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{job="cash-flow/daily-balance"}[5m])))`                                                                                                                         | p95 < 500 ms                             | —                                         |
| Consolidation freshness       | `histogram_quantile(0.95, sum by (le) (rate(cashflow_consolidation_lag_seconds_bucket[5m])))`                                                                                                                                                          | p95 < 30 s (measured: 0.5 s)             | —                                         |
| Outbox freshness              | `max(cashflow_outbox_lag_seconds)`                                                                                                                                                                                                                     | < 60 s                                   | —                                         |
| No lost entries               | `rabbitmq_detailed_queue_messages{queue="daily-balance.ledger-events.dlq"}` and the journal matching the ledger                                                                                                                                        | 0 messages in the DLQ                    | none                                      |

The internal target for the daily balance is stricter than the requirement so that the requirement is never the first line breached. Measured locally: 0% failures at 50 req/s, including 30-second outages of Redis and of the daily balance database.

Burn-rate based alerting on these SLOs is a planned evolution; today alerts use fixed thresholds ([alerts.yml](../infra/prometheus/alerts.yml)).

## Runbooks

General tools:

| Tool                        | Local address                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Grafana dashboard Cash Flow | http://localhost:3000                                                                       |
| Prometheus alerts           | http://localhost:9090/alerts                                                                |
| RabbitMQ management         | http://localhost:15672                                                                      |
| Traces and logs             | Grafana → Explore → Tempo (by `x-trace-id`) or Loki                                         |
| Service state               | `docker compose ps`, `curl localhost:3001/health/ready`, `curl localhost:3002/health/ready` |

Useful Loki query for errors and warnings: `{service_namespace="cash-flow"} | severity_number >= 13`.

### DailyBalanceRequestLossAboveBudget (critical)

- **Symptom:** more than 5% of report requests fail (`5xx` or `429`) for 2 minutes. This breaches the business requirement.
- **Impact:** merchants cannot see their consolidated balance. Recording entries is not affected.
- **Diagnosis:**
  1. Dashboard row "API do consolidado": split by status. `429` means rate limiting; `503` with code `BALANCE_REPORT_UNAVAILABLE` means database down and nothing cached; `503 AUTHENTICATION_UNAVAILABLE` means JWKS unreachable; other `5xx` means a bug.
  2. Check `/health/ready` of `daily-balance` and the circuit breaker panel.
  3. Loki: `{service_name="daily-balance"} | severity_number >= 17`.
- **Mitigation:** for `429` caused by legitimate load, raise `RATE_LIMIT_MAX` or add replicas; for database problems, see `CircuitBreakerOpen`; for Keycloak, restore it (tokens already issued keep working once keys are cached).
- **Recovery:** confirm the success ratio is back above 99.5% on the dashboard.

### LedgerErrorRateHigh (critical)

- **Symptom:** more than 1% of ledger requests return `5xx` for 5 minutes.
- **Impact:** entries may not be recorded; this is the most critical capability.
- **Diagnosis:** `docker compose ps ledger postgres-ledger`; `/health/ready` of the ledger; Loki `{service_name="ledger"} | severity_number >= 17`; open a failing request trace in Tempo using the `x-trace-id` returned to the client.
- **Mitigation:** restore `postgres-ledger` (the ledger depends only on its own database; RabbitMQ and the daily balance are not in its path). Roll back the last deployment if errors started with it.
- **Recovery:** idempotent clients can safely retry with the same `Idempotency-Key`; no duplicate entries are created.

### DailyBalanceLatencyHigh (warning)

- **Symptom:** report p95 above 500 ms for 5 minutes.
- **Diagnosis:** cache hit ratio panel (a drop in `hit` pushes load to the database); `DATABASE_TIMEOUT_MS` errors in logs; slow spans in Tempo filtered by `service.name = daily-balance`.
- **Mitigation:** check Redis health; add API replicas; check database load (long period reports up to 92 days are the most expensive).

### OutboxLagHigh (warning)

- **Symptom:** the oldest pending event is older than 60 s.
- **Impact:** the daily balance stops receiving new entries; recording is not affected.
- **Diagnosis:**
  1. `docker compose ps ledger-outbox-relay rabbitmq`; relay `/health/ready` reports PostgreSQL and RabbitMQ.
  2. Rejected events: panel "Publicação do relay" (`cashflow_outbox_rejected_total`).
  3. Stuck events in the ledger database:
     ```sql
     SELECT event_type, attempts, last_error, next_attempt_at
     FROM outbox WHERE published_at IS NULL ORDER BY occurred_at LIMIT 20;
     ```
     `last_error` containing "has no bound queue" means no queue is bound for that event type (consumer topology missing).
- **Mitigation:** restart the relay or the broker; if events are unroutable, start the daily balance consumer (it declares its queues) — the relay retries them automatically with backoff (up to 5 minutes between attempts).
- **Recovery:** pending count returns to 0; no manual republish is needed.

### ConsolidationLagHigh (warning)

- **Symptom:** p95 time from recording to consolidation above 30 s.
- **Diagnosis:** is the delay in the outbox (`OutboxLagHigh`) or in the queue (`ConsumerBacklogGrowing`)? Consumer outcome panel: many `retry` outcomes indicate database trouble on the daily balance side.
- **Mitigation:** fix the upstream cause; scale consumers or increase `CONSUMER_PREFETCH` if throughput is the issue.

### ConsumerBacklogGrowing (warning)

- **Symptom:** more than 1,000 messages ready in `daily-balance.ledger-events` for 5 minutes.
- **Diagnosis:** `docker compose ps daily-balance-consumer`; consumer `/health/ready` (`ledger-events-consumer` must be `up`); retries in the consumer outcome panel.
- **Mitigation:** restart or scale the consumer (`docker compose up -d --scale daily-balance-consumer=3`); consumers are idempotent and safe to run in parallel.

### DeadLetterQueueNotEmpty (critical)

- **Symptom:** messages in `daily-balance.ledger-events.dlq`.
- **Impact:** the daily balance is missing those entries until they are redriven.
- **Diagnosis:** RabbitMQ management → Queues → `daily-balance.ledger-events.dlq` → Get messages (with "Nack, requeue true"). Read the `x-dead-letter-reason` header:
  - `Message body is not valid JSON` or `does not match the ledger event contract`: a producer or contract bug; do not redrive until fixed;
  - `Gave up after N attempts: ...`: transient problem (usually the database) that lasted longer than `CONSUMER_MAX_ATTEMPTS × CONSUMER_RETRY_DELAY_MS`.
- **Mitigation:** fix the cause first.
- **Recovery:**
  ```bash
  docker compose exec daily-balance-consumer node dist/redrive-dead-letters.js --limit 1000
  ```
  Redriving an event that was already applied is safe (deduplication by event and entry id). If a day is suspected to be wrong, rebuild it from the journal:
  ```bash
  docker compose exec daily-balance-consumer node dist/rebuild-day.js --merchant <merchant-id> --date <yyyy-mm-dd>
  ```

### CircuitBreakerOpen (warning)

- **Symptom:** `cashflow_circuit_breaker_state == 2` for a circuit (`redis` or `postgres`) for more than 1 minute.
- **Impact:** `redis` open: no caching, all reads go to the database (higher latency, no stale fallback for new reports). `postgres` open: only cached reports are served (`STALE`); others get `503`.
- **Diagnosis:** health of the dependency (`docker compose ps redis postgres-daily-balance`); logs `circuit breaker state changed`.
- **Mitigation:** restore the dependency; the circuit closes by itself after a successful trial call (every `CIRCUIT_RESET_TIMEOUT_MS`).

### StaleBalanceReportsServed (warning)

- **Symptom:** responses with `x-cache: STALE`.
- **Impact:** merchants see a balance computed before the database became unavailable (the response carries `generatedAt`).
- **Mitigation:** same as `CircuitBreakerOpen` for `postgres`. Once the database returns, fresh reports replace the stale ones automatically.

### ServiceNotReportingTelemetry (critical)

- **Symptom:** `cashflow_service_up` absent for a job.
- **Diagnosis:** `docker compose ps`; container logs (`docker compose logs <service> --tail 200`); if the process is running, check the Collector (`docker compose logs otel-collector`).
- **Mitigation:** restart the service; check resource limits and crash loops (startup fails fast on invalid configuration and on an unreachable database for migrations).

## Backup and disaster recovery

| Data store               | Role                              | RPO target                                  | RTO target | Backup strategy (production)                                        | Rebuildable?                               |
| ------------------------ | --------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Ledger PostgreSQL        | Source of truth (entries, outbox) | ≤ 5 min (PITR, near zero with sync replica) | ≤ 30 min   | Continuous WAL archiving + daily snapshots, multi-AZ standby        | No — it is the source of truth             |
| Daily balance PostgreSQL | Read model and movement journal   | ≤ 1 h                                       | ≤ 1 h      | Daily snapshots + WAL                                               | Yes, from ledger events                    |
| RabbitMQ                 | Transport                         | n/a                                         | ≤ 15 min   | Quorum queues replicated across 3 nodes                             | Yes, unpublished events stay in the outbox |
| Redis                    | Cache                             | n/a                                         | minutes    | None needed                                                         | Yes, refilled on demand                    |
| Keycloak database        | Users, realm                      | ≤ 1 h                                       | ≤ 1 h      | Daily snapshots; realm configuration is versioned in the repository | Realm yes (import); users need backup      |

**Rebuilding the daily balance after losing its database:**

1. Restore the latest snapshot (or start empty); migrations run on startup.
2. Republish ledger events for the affected period by resetting the outbox:
   ```sql
   UPDATE outbox SET published_at = NULL, attempts = 0, next_attempt_at = now()
   WHERE occurred_at >= '<start of the period>';
   ```
3. The relay publishes them again; the consumer deduplicates events already present in the restored journal and applies the rest.
4. Validate a sample of days against the ledger (sum of entries by merchant and business date) and run `rebuild-day` where needed.

This relies on keeping published outbox rows for at least the retention window of daily balance backups (see housekeeping).

**DR testing cadence:** restore the ledger from backup into a scratch environment quarterly; run the daily balance rebuild procedure semi-annually; run the automated resilience tests (`npm run test:resilience*`) on every release.

## Deployment practices

- **Zero-downtime deploys:** rolling updates with readiness gates. The API readiness reports dependencies; for the daily balance API, shared dependencies are non-critical (`degraded`) so replicas are not removed all at once.
- **Migrations:** run at startup under a PostgreSQL advisory lock, so multiple replicas starting together apply each migration once. Migrations must be backward compatible (expand/contract): add columns and tables first, deploy code that uses them, remove old structures in a later release.
- **Event contracts:** breaking changes become a new event version (`v2`) published alongside `v1` until all consumers migrate.
- **Health checks:** `/health/live` only says the process is alive (used for restarts); `/health/ready` checks dependencies (used for routing traffic). Relay and consumer expose the same endpoints on their health server.
- **Configuration:** validated at startup; an invalid value stops the process with a clear error.

### Scaling and tuning knobs

| Variable                     | Process                | Default | Effect                                                 |
| ---------------------------- | ---------------------- | ------- | ------------------------------------------------------ |
| `DATABASE_POOL_SIZE`         | all                    | 10      | Connections per replica                                |
| `RATE_LIMIT_MAX`             | ledger                 | 1,200   | Requests per merchant per window (per replica)         |
| `RATE_LIMIT_MAX`             | daily-balance          | 6,000   | Requests per merchant per window (per replica)         |
| `RATE_LIMIT_WINDOW_MS`       | APIs                   | 60,000  | Rate limit window                                      |
| `MAX_BACKDATED_DAYS`         | ledger                 | 30      | Oldest business date accepted                          |
| `OUTBOX_BATCH_SIZE`          | ledger-outbox-relay    | 100     | Events per cycle (max 1,000)                           |
| `OUTBOX_POLL_INTERVAL_MS`    | ledger-outbox-relay    | 500     | Idle wait between cycles                               |
| `OUTBOX_MAX_BACKOFF_MS`      | ledger-outbox-relay    | 30,000  | Maximum wait after infrastructure failures             |
| `OUTBOX_RETRY_BASE_DELAY_MS` | ledger-outbox-relay    | 1,000   | First retry delay for a rejected event                 |
| `OUTBOX_RETRY_MAX_DELAY_MS`  | ledger-outbox-relay    | 300,000 | Maximum retry delay for a rejected event               |
| `CONSUMER_PREFETCH`          | daily-balance-consumer | 20      | Messages processed in parallel per replica (max 1,000) |
| `CONSUMER_MAX_ATTEMPTS`      | daily-balance-consumer | 5       | Attempts before the DLQ                                |
| `CONSUMER_RETRY_DELAY_MS`    | daily-balance-consumer | 10,000  | Wait in the retry queue                                |
| `CACHE_FRESH_TTL_MS`         | daily-balance          | 5,000   | Report freshness in the cache                          |
| `CACHE_STALE_TTL_SECONDS`    | daily-balance          | 86,400  | How long a report is kept as fallback                  |
| `CACHE_TIMEOUT_MS`           | daily-balance          | 100     | Maximum time of a Redis call                           |
| `DATABASE_TIMEOUT_MS`        | daily-balance          | 2,000   | Connection and statement timeout                       |
| `CIRCUIT_FAILURE_THRESHOLD`  | daily-balance          | 5       | Consecutive failures that open a circuit               |
| `CIRCUIT_RESET_TIMEOUT_MS`   | daily-balance          | 10,000  | Time open before a trial call                          |

To tolerate longer database outages without the DLQ, increase `CONSUMER_MAX_ATTEMPTS × CONSUMER_RETRY_DELAY_MS` (default window about 50 s).

### Capacity reference

Measured on an Apple M1 laptop with all containers on the same machine, one replica per process:

| Load                                           | Failures | p95     |
| ---------------------------------------------- | -------- | ------- |
| 50 req/s on the daily balance (2 min)          | 0%       | 6.5 ms  |
| 200 req/s                                      | 0%       | 7.6 ms  |
| 400 req/s                                      | 0%       | 20.9 ms |
| 10 req/s of writes with the daily balance down | 0%       | 20 ms   |

Horizontal scaling: APIs and consumers are stateless (state lives in PostgreSQL, Redis and RabbitMQ); the relay scales with `SKIP LOCKED`; the per-replica rate limit must be adjusted or moved to a shared store when replicas are added.

## Housekeeping

| Item                  | Current state                                               | Plan                                                                                           |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Published outbox rows | Kept forever                                                | Periodic job deleting rows published more than N days ago (N ≥ daily balance backup retention) |
| Idempotency keys      | Kept forever                                                | Expire after 24–72 h (clients retry within minutes)                                            |
| Movement journal      | Kept forever                                                | Archive closed periods to cold storage                                                         |
| Logs and traces       | 7-day Prometheus retention; Tempo blocks 24 h; Loki default | Production: object storage with 30-day logs and traces, 13-month metrics downsampled           |

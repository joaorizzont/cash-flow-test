# ADR-0008: Materialized daily balance with an idempotent consumer

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The daily balance must answer 50 req/s at peak with at most 5% loss. Computing the balance at query time (summing every entry of the day, and every previous day for the accumulated balance) would make reads cost proportional to history and couple the report to the ledger. Events arrive at least once, possibly duplicated, out of order, and possibly while the database is temporarily unavailable.

## Decision

Apply **CQRS with a materialized read model**:

- `daily_balances` keeps, per merchant and business date, `total_credits_cents`, `total_debits_cents`, `entry_count` and a generated `balance_cents`.
- `applied_movements` is a **journal** of every consolidated event: primary key `event_id` and a unique `entry_id`.

For each event, in **one transaction**, the consumer:

1. inserts the movement into the journal with `ON CONFLICT DO NOTHING`; if nothing was inserted, the event is a duplicate and processing stops;
2. otherwise applies an **additive upsert** (`INSERT ... ON CONFLICT DO UPDATE SET total = total + delta`), which is atomic even with many consumers updating the same day;
3. acknowledges the message only after commit.

Deduplication by `entry_id` as well as `event_id` protects against the same entry arriving under two event ids, for example `v1` and `v2` published in parallel during a contract migration.

A reversal arrives as a movement of the opposite type, so the balance of the day is corrected while the totals still show what really moved, like a bank statement.

**Failure handling** in the consumer:

| Situation                                    | Handling                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Not JSON or breaks the contract              | Straight to the DLQ with `x-dead-letter-reason`; retrying would not help                            |
| Rejected by the domain                       | Same: DLQ immediately                                                                               |
| Transient failure (database down)            | Republished to the retry queue with `x-attempt + 1`, returns after `CONSUMER_RETRY_DELAY_MS` (10 s) |
| Attempts exhausted (`CONSUMER_MAX_ATTEMPTS`) | DLQ with the last error                                                                             |

Republishing to the retry queue or DLQ uses publisher confirms, and the original is acknowledged only after the confirm, so no message is lost in transit. Queues are **quorum queues** ([ADR-0006](0006-rabbitmq-message-broker.md)).

**Operations**: `rebuild-day` recomputes a day from the journal. It first locks the day row, then reads the journal, so it is safe to run with the consumer active (an integration test runs five rebuilds concurrently with 60 consolidations and checks the final balance against the journal). `redrive-dead-letters` moves DLQ messages back to the main queue after the cause is fixed.

## Alternatives considered

| Alternative                                       | Why it was not chosen                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Compute the balance at query time from the ledger | Synchronous coupling to the ledger and query cost growing with history               |
| Read-modify-write of the balance                  | Lost updates under concurrency unless every update locks the row                     |
| Deduplicate with a separate cache (Redis set)     | Not atomic with the balance update; a crash between both breaks exactly-once effects |
| Rebuild from the ledger API                       | Runtime coupling to the ledger; the local journal is enough                          |
| `nack` with immediate requeue                     | Hot loop while the database is down; delayed retry through a TTL queue avoids it     |
| Process-level circuit breaker pausing consumption | More complex; the delayed retry already absorbs short outages                        |

## Consequences

**Positive**

- Reads are primary-key lookups and range scans, which is what makes the peak trivial (50 req/s at p95 6.5 ms; 400 req/s with no errors on a single replica).
- Exactly-once effect on the balance despite at-least-once delivery (tested with three parallel deliveries of the same event).
- The read model can be rebuilt per day without the ledger.

**Negative / trade-offs**

- Eventual consistency between recording and the report (p95 0.5 s measured).
- An outage of the daily balance database longer than about 50 s (5 attempts × 10 s) sends messages to the DLQ; nothing is lost, but a redrive is needed. The alert `DeadLetterQueueNotEmpty` makes this visible; attempts and delay are configurable.
- The journal grows with every entry; archiving older periods is a future evolution.

## Evidence

- Use case: [consolidate-movement-service.ts](../../services/daily-balance/src/application/use-cases/consolidate-movement-service.ts)
- Journal and additive upsert: [postgres-movement-journal.ts](../../services/daily-balance/src/adapters/outbound/postgres/postgres-movement-journal.ts), [postgres-daily-balance-repository.ts](../../services/daily-balance/src/adapters/outbound/postgres/postgres-daily-balance-repository.ts)
- Outcome decision and DLQ rules: [ledger-message-handler.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-message-handler.ts)
- Retry and DLQ publishing: [rabbitmq-ledger-event-consumer.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-ledger-event-consumer.ts)
- Rebuild and redrive: [rebuild-daily-balance-service.ts](../../services/daily-balance/src/application/use-cases/rebuild-daily-balance-service.ts), [rabbitmq-dead-letter-redriver.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-dead-letter-redriver.ts)
- Domain aggregate: [daily-balance.ts](../../services/daily-balance/src/domain/balance/daily-balance.ts)

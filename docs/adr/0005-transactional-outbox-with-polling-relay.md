# ADR-0005: Transactional outbox with a polling relay

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Every recorded or reversed entry must produce an event for the daily balance. Writing the entry to the database and then publishing to the broker is a dual write: if the process dies between the two, either the event is lost (balance wrong forever) or the event is published for an entry that was rolled back. Publishing inside the HTTP request would also put the broker in the critical path of recording, violating the requirement that recording keeps working when other parts fail.

## Decision

Use the **Transactional Outbox** pattern:

1. The ledger writes the entry and its event (a CloudEvent, [ADR-0007](0007-cloudevents-shared-contracts.md)) to the `outbox` table in the **same transaction**. The API never talks to the broker.
2. A separate process, `ledger-outbox-relay` (same image, different command), runs a polling worker:
   - selects up to `OUTBOX_BATCH_SIZE` pending events whose `next_attempt_at` has passed, with `FOR UPDATE SKIP LOCKED`;
   - publishes them in parallel to RabbitMQ with **publisher confirms**, `persistent` messages and the **`mandatory`** flag;
   - marks confirmed events as published; events returned by the broker (no queue bound) are rejected individually and rescheduled with **per-message exponential backoff** (`attempts`, `last_error`, `next_attempt_at`, 1 s up to 5 min);
   - if the failure is infrastructure (database or broker unavailable), the whole batch is rolled back and the worker backs off (up to 30 s).
3. Pacing: immediately again when the batch published something, after `OUTBOX_POLL_INTERVAL_MS` (500 ms) when idle.

Delivery is **at least once**; the CloudEvent `id` (also sent as AMQP `messageId`) lets consumers deduplicate.

## Alternatives considered

| Alternative                               | Why it was not chosen                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Publish directly from the request         | Dual write, and the broker becomes a dependency of recording                                                             |
| Publish after commit, best effort         | Loses events on crash between commit and publish                                                                         |
| Relay as a background task inside the API | Shares resources and lifecycle with the API; scaling and failures are coupled                                            |
| CDC with Debezium reading the WAL         | Millisecond latency and no polling, but adds Kafka Connect or Debezium Server to operate. Recorded as a future evolution |
| `LISTEN/NOTIFY` to wake the relay         | Lower latency, but needs a dedicated connection and polling would still be required as a safety net. Future evolution    |
| Alternate exchange for unroutable events  | Would park messages in another queue requiring manual reprocessing; keeping them in the outbox with backoff is simpler   |

## Consequences

**Positive**

- No event is lost: verified by recording 900 entries while the whole consolidated side was down and checking that all 900 were consolidated with the exact total.
- RabbitMQ outages do not affect recording; events accumulate in the outbox and are published when the broker returns (the relay reconnects automatically).
- One problematic event never blocks the others (head-of-line blocking was found during development and fixed by the per-message backoff).
- Horizontal scaling of the relay without duplicates: an integration test runs three relays concurrently over 40 events and each is published exactly once.

**Negative / trade-offs**

- Up to about 500 ms of extra latency when idle (measured consolidation lag: p50 0.26 s, p95 0.5 s), irrelevant for a daily report.
- One query every 500 ms when idle; cheap because a partial index contains only pending rows.
- The outbox grows; a cleanup job for published rows is a pending housekeeping item.
- Duplicates are possible (crash between publish and mark), so every consumer must be idempotent.

## Evidence

- Outbox write in the same transaction: [postgres-entry-repository.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-entry-repository.ts), [outbox-writer.ts](../../services/ledger/src/adapters/outbound/postgres/outbox-writer.ts)
- Locking and failure recording: [postgres-outbox-store.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-outbox-store.ts)
- Batch logic and rejection isolation: [publish-pending-events-service.ts](../../services/ledger/src/application/use-cases/publish-pending-events-service.ts), [retry-backoff.ts](../../services/ledger/src/application/services/retry-backoff.ts)
- Confirms and `mandatory`: [rabbitmq-event-publisher.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-event-publisher.ts), [unroutable-event-error.ts](../../services/ledger/src/adapters/outbound/messaging/unroutable-event-error.ts)
- Worker pacing and backoff: [polling-worker.ts](../../services/ledger/src/adapters/inbound/scheduler/polling-worker.ts)
- Retry columns: [0004-add-outbox-retry-columns.ts](../../services/ledger/src/adapters/outbound/postgres/migrations/0004-add-outbox-retry-columns.ts)

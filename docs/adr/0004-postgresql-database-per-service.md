# ADR-0004: PostgreSQL, one database per service

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The ledger stores money and is the source of truth. It needs atomic writes across several tables (entry, outbox event, idempotency key), constraints that hold under concurrency (positive amounts, a single reversal per entry, point of sale owned by the same merchant), and a queue-like read pattern for the outbox with multiple relay instances. The daily balance needs atomic "add to the current total" updates from concurrent consumers, deduplication of events, and small range reads by merchant and date. Data volumes are modest (tens of events per second) and the access patterns are well known.

## Decision

Use **PostgreSQL 17** for both services, with **one database per service** (`ledger` and `daily_balance`), never shared. Access is through `node-postgres` with explicit SQL, transactions propagated with `AsyncLocalStorage`, and migrations written as TypeScript modules applied at startup under a PostgreSQL advisory lock.

Critical rules are enforced by the database as well as by the domain:

| Rule                                  | Mechanism                                                   |
| ------------------------------------- | ----------------------------------------------------------- |
| Amount is positive                    | `CHECK` constraint                                          |
| An entry is reversed at most once     | Unique partial index on `reversal_of`                       |
| Point of sale belongs to the merchant | Composite foreign key `(merchant_id, point_of_sale_id)`     |
| Idempotency                           | Key stored atomically with the response and the entry       |
| Event processed once                  | Primary key on `event_id`, unique `entry_id` in the journal |
| Balance always equals the totals      | Generated column `balance_cents`                            |

## Alternatives considered

| Need                                        | PostgreSQL                                               | NoSQL option and its limitation                                                                                               |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Entry and event written atomically (outbox) | Plain `BEGIN`/`COMMIT` over two tables                   | MongoDB needs a replica set for multi-document transactions; DynamoDB limits items per transaction and pushes towards Streams |
| Invariants under concurrency                | `CHECK`, unique and foreign key constraints              | Usually enforced only in application code, which races under concurrency                                                      |
| Several relays reading the outbox           | `FOR UPDATE SKIP LOCKED`                                 | Requires a lease or distributed lock implemented separately                                                                   |
| Additive balance updates                    | `INSERT ... ON CONFLICT DO UPDATE SET total = total + x` | `$inc` / `ADD` exist, but deduplication in the same transaction is harder                                                     |
| Period reports and accumulated balance      | Range scan on the primary key, `SUM` before a date       | Possible with careful key design, but less flexible for ad hoc queries                                                        |

| Other alternative        | Why it was not chosen                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| A single shared database | Couples the services at the data level: a migration or overload on one side affects the other              |
| An ORM (Prisma, TypeORM) | Hides exactly the constructs this solution depends on (`SKIP LOCKED`, `ON CONFLICT`, advisory locks)       |
| External migration tool  | An extra deployment step; TypeScript migrations are compiled into the image and run under an advisory lock |

NoSQL would be reconsidered for volumes and access patterns that do not fit a single relational node (for example storing raw events at very high scale). In that case the hexagonal structure ([ADR-0003](0003-hexagonal-architecture.md)) confines the change to repository adapters.

## Consequences

**Positive**

- Invariants hold even under concurrent requests (integration tests: concurrent requests with the same idempotency key store one entry; concurrent reversals produce one success and one conflict; concurrent deliveries of the same event are counted once).
- Database per service preserves the failure isolation required by [ADR-0002](0002-event-driven-microservices.md).

**Negative / trade-offs**

- Vertical scaling limits for writes on a single primary; addressed later with read replicas and partitioning if needed (see [future evolutions](../08-future-evolutions.md)).
- An idle connection terminated by the server makes `pg` emit an `error` event on the pool, which crashes Node if unhandled. Every pool now handles it (found during resilience testing, covered by a regression test).

## Evidence

- Ledger schema: [0001-create-points-of-sale-and-entries.ts](../../services/ledger/src/adapters/outbound/postgres/migrations/0001-create-points-of-sale-and-entries.ts)
- Daily balance schema: [0001-create-daily-balances.ts](../../services/daily-balance/src/adapters/outbound/postgres/migrations/0001-create-daily-balances.ts), [0002-create-applied-movements.ts](../../services/daily-balance/src/adapters/outbound/postgres/migrations/0002-create-applied-movements.ts)
- Transactions and pool error handling: [postgres-database.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-database.ts)
- Migrations under advisory lock: [postgres-migrator.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-migrator.ts)

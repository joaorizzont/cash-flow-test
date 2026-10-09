# ADR-0002: Event-driven microservices

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The business needs two capabilities: recording cash entries (credits and debits) and reporting the consolidated daily balance. The strongest non-functional requirement is that **the entry recording service must stay available when the daily balance service is down**. The daily balance service must sustain **50 requests per second at peak with at most 5% loss**.

These two capabilities have very different profiles:

| Aspect            | Ledger (recording)                         | Daily balance (reporting)  |
| ----------------- | ------------------------------------------ | -------------------------- |
| Nature            | Write-heavy, source of truth               | Read-heavy, derived data   |
| Consistency       | Strong (money, idempotency)                | Eventual is acceptable     |
| Failure tolerance | Must not fail because of the other context | Can lag behind for seconds |
| Scaling driver    | Number of sales                            | Report queries at peak     |

## Decision

Split the system into **two services aligned to the two bounded contexts** (`ledger` and `daily-balance`), each with its own process, database and deployment. They communicate **only through asynchronous events** published by the ledger to a message broker. There is no synchronous call between them in either direction.

Each service runs as more than one process from the same image, so that work with a different profile is isolated:

| Process                  | Responsibility                                       |
| ------------------------ | ---------------------------------------------------- |
| `ledger`                 | HTTP API to record, reverse and query entries        |
| `ledger-outbox-relay`    | Publishes outbox events to the broker                |
| `daily-balance`          | HTTP API for daily and period reports                |
| `daily-balance-consumer` | Consumes ledger events and updates the daily balance |

The split stops at two services: finer decomposition (for example a separate point-of-sale service) would add operational cost without a requirement that justifies it.

## Alternatives considered

| Alternative                | Why it was not chosen                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monolith                   | A bug, memory leak or traffic spike in reporting would take down recording too, violating the main requirement                                                                                   |
| Modular monolith           | Gives clean domain boundaries, but the modules share process, connection pool and deployment, so it cannot guarantee failure isolation. It would be the choice if that requirement did not exist |
| Synchronous microservices  | If the ledger called the daily balance service (or vice versa) over HTTP, an outage of one would propagate to the other                                                                          |
| Serverless functions       | Handles the load, but makes running the whole solution locally harder (a requirement of the challenge), increases provider lock-in and suffers from cold starts at peak                          |
| Many fine-grained services | More moving parts, network hops and operational overhead with no requirement driving them                                                                                                        |

## Consequences

**Positive**

- Real failure isolation: verified by an automated test that takes the whole daily balance side down (API, consumer and database) while entries are recorded at 10 req/s; the ledger had zero failures and every entry was consolidated after recovery.
- Each side scales independently; the read side can add replicas for peak without touching the ledger.
- New consumers (for example analytics or notifications) can subscribe to ledger events without changing the producer.

**Negative / trade-offs**

- The daily balance is eventually consistent (measured p95 of 0.5 s from recording to consolidation).
- Messaging brings at-least-once delivery, which requires idempotent consumers ([ADR-0008](0008-materialized-daily-balance.md)) and a reliable way to publish ([ADR-0005](0005-transactional-outbox-with-polling-relay.md)).
- More infrastructure to operate (broker, two databases); mitigated by Docker Compose, health checks and observability from the start ([ADR-0012](0012-opentelemetry-grafana-stack.md)).

## Evidence

- Composition of processes: [docker-compose.yml](../../docker-compose.yml)
- Ledger entry points: [main.ts](../../services/ledger/src/main.ts), [relay.ts](../../services/ledger/src/relay.ts)
- Daily balance entry points: [main.ts](../../services/daily-balance/src/main.ts), [consumer.ts](../../services/daily-balance/src/consumer.ts)
- Resilience test: [consolidated-outage.mjs](../../tests/resilience/consolidated-outage.mjs)

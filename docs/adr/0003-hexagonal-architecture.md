# ADR-0003: Hexagonal architecture inside each service

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

In a microservice system, the parts most likely to change are the edges: the contract of the events exchanged between the two services (new fields, a `v2` of an event, a different envelope), the broker (RabbitMQ could become SQS or Kafka), the HTTP API consumed by other systems and, less often, the database. The business rules of cash entries and daily balances, on the other hand, are stable. A structure where business logic imports framework, driver or message formats directly would turn every contract change into a change of the core.

## Decision

Both services follow **Ports and Adapters (hexagonal architecture)** with dependencies always pointing inward:

```
src/
├─ domain/        entities, value objects, domain events and errors (no I/O, no frameworks)
├─ application/   use cases, inbound ports (what the outside calls) and outbound ports (what the use cases need)
├─ adapters/
│  ├─ inbound/    HTTP routes, message consumer, polling worker
│  └─ outbound/   PostgreSQL, RabbitMQ, Redis, telemetry, system clock
├─ config/        environment validation
└─ container.ts   composition root wiring adapters into use cases
```

Rules:

- the domain does not import anything outside the domain;
- use cases depend only on port interfaces;
- the translation between the internal model and an external contract lives in exactly one adapter (for example the event mapper in the ledger and the event translator in the daily balance, which acts as an anti-corruption layer);
- concrete adapters are chosen only in the composition root.

Tactical DDD complements it: value objects (`Money`, `BusinessDate`, `TimeZone`, identifiers) make invalid states unrepresentable, and the `Entry` aggregate owns the reversal rules and raises domain events.

## Alternatives considered

| Alternative                    | Why it was not chosen                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Layered architecture (MVC-ish) | Business logic tends to depend on the persistence layer and framework types; harder to test without infrastructure |
| Framework-centric (NestJS)     | Couples the structure to the framework's modules and decorators; more weight than the scope requires               |
| Clean Architecture in full     | Same principle with more layers and ceremony (presenters, separate entity and use case rings) for little gain here |

## Consequences

**Positive**

| Change                                       | What changes                                                     | What does not change                    |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| New field or `v2` of an event                | Contracts package and the mapper/translator                      | Domain, use cases                       |
| Publishing `v1` and `v2` during a transition | Only the mapper                                                  | Domain, use cases and the other service |
| RabbitMQ replaced by SQS or Kafka            | A new adapter implementing the publisher port and a new consumer | Domain, use cases, outbox and contracts |
| New HTTP version or protocol                 | Inbound adapter                                                  | Domain and use cases                    |
| Database replaced                            | Repository adapters                                              | Domain, use cases and their unit tests  |

- The core is unit tested with in-memory fakes and no infrastructure (more than 290 unit tests across both services run in about one second); adapters have their own integration tests against real PostgreSQL, RabbitMQ, Redis and Keycloak containers.
- Cross-cutting concerns stayed out of the core: authentication lives in the HTTP adapter and the use cases only receive a `merchantId`; metrics live in adapters and the domain has no dependency on OpenTelemetry.

**Negative / trade-offs**

- More interfaces and files than a simple layered design. Accepted because contract changes are frequent in distributed systems and the cost of a change stays small.
- Some duplication between services (infrastructure adapters such as the PostgreSQL connection, migrator and RabbitMQ connection exist in both). This is deliberate: only the event contracts are shared, so each service can evolve its infrastructure without coordinated releases.

## Evidence

- Ledger ports: [application/ports](../../services/ledger/src/application/ports/outbound/entry-repository.ts), composition root [container.ts](../../services/ledger/src/container.ts)
- Event mapping in one adapter: [ledger-event-mapper.ts](../../services/ledger/src/adapters/outbound/messaging/ledger-event-mapper.ts)
- Anti-corruption layer on the consumer side: [ledger-event-translator.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-event-translator.ts)
- Publisher port with a replaceable adapter: [event-publisher.ts](../../services/ledger/src/application/ports/outbound/event-publisher.ts), [rabbitmq-event-publisher.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-event-publisher.ts)
- Domain aggregate: [entry.ts](../../services/ledger/src/domain/entry/entry.ts)

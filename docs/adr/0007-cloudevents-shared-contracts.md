# ADR-0007: CloudEvents and a shared contracts package

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The ledger and the daily balance are developed and deployed independently but must agree on the shape of the events between them. A contract that drifts silently produces wrong balances; a contract that couples the services through shared business code defeats the purpose of splitting them.

## Decision

- Events use the **CloudEvents 1.0** envelope (`specversion`, `id`, `source`, `type`, `subject`, `time`, `datacontenttype`, `data`), published as `application/cloudevents+json`.
- The **version is part of the type**: `cashflow.ledger.entry.recorded.v1` and `cashflow.ledger.entry.reversed.v1`. A breaking change becomes `v2`, published alongside `v1` during a transition.
- The schemas live in a **shared package, `@cash-flow/contracts`** (a "published language" in DDD terms), written with TypeBox: one definition provides the TypeScript type, the JSON Schema and a compiled validator. The package contains schemas and validation only, never business logic.
- The consumer validates every message against the contract before processing; invalid messages go straight to the DLQ.
- The optional `traceparent` and `tracestate` attributes from the CloudEvents **Distributed Tracing** extension carry the trace context through the outbox ([ADR-0012](0012-opentelemetry-grafana-stack.md)).

## Alternatives considered

| Alternative                           | Why it was not chosen                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Custom envelope                       | Every metadata field would need documentation; CloudEvents is understood by tools and other teams |
| Schema registry (Confluent, Apicurio) | Better with many teams and services; overhead for two services. Recorded as a future evolution    |
| Duplicate the schema in each service  | Drift is only caught in production                                                                |
| Avro or Protobuf                      | Smaller payloads, but less readable and tooling-heavy for this volume                             |

## Consequences

**Positive**

- A contract change shows up as a compile error and a failing test in both services in the same repository.
- Contract evolution is explicit (`v1` / `v2`), and the hexagonal adapters keep the change local ([ADR-0003](0003-hexagonal-architecture.md)).

**Negative / trade-offs**

- The package is a build-time dependency of both services; in separate repositories it would be versioned and published to a registry.
- The source export condition (`"source"`) adds a small amount of build configuration so that tests and development use TypeScript sources and the image uses compiled output.

## Evidence

- Envelope and tracing attributes: [cloud-event.ts](../../packages/contracts/src/cloud-event.ts)
- Ledger event schemas and validators: [ledger-events.ts](../../packages/contracts/src/ledger/ledger-events.ts)
- Producer mapping: [ledger-event-mapper.ts](../../services/ledger/src/adapters/outbound/messaging/ledger-event-mapper.ts)
- Consumer validation: [ledger-message-handler.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-message-handler.ts)

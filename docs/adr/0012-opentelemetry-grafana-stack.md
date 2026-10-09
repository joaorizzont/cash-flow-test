# ADR-0012: OpenTelemetry with Prometheus, Tempo, Loki and Grafana

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

A request that records an entry crosses three processes asynchronously (API, relay, consumer) with an outbox in the middle. When a balance looks wrong or late, operators need to follow one entry end to end, see how long it waited in each stage, and correlate logs. They also need metrics and alerts tied to the non-functional requirements (5% loss at peak, ledger availability, consolidation delay).

## Decision

- Instrument every process with **OpenTelemetry** (traces, metrics and logs), loaded before the application with `node --import ./dist/telemetry.js`. Auto-instrumentation covers HTTP, Fastify (route names), PostgreSQL, RabbitMQ, Redis and pino. Telemetry starts only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so tests and local runs without the stack are unaffected.
- Export **OTLP to an OpenTelemetry Collector**, which routes traces to **Tempo**, metrics to **Prometheus** (exporter scraped by Prometheus, plus RabbitMQ queue metrics) and logs to **Loki** (native OTLP). **Grafana** is provisioned with the three data sources, links log → trace and trace → logs, a dashboard and Prometheus alert rules.
- **Trace context crosses the outbox inside the event**: the ledger stores `traceparent`/`tracestate` in the CloudEvent (Distributed Tracing extension); the relay publishes inside that context; the consumer continues the same trace. One trace shows the HTTP request, the outbox insert, the publish, and the consumer's database writes.
- **Correlation**: every response carries `x-trace-id`; every log line has `trace_id` and `span_id`.
- **Business and pipeline metrics in adapters** (the domain does not depend on OpenTelemetry): entries recorded, outbox pending and age, published and rejected events, consumer outcomes, consolidation lag histogram, cache hit/miss/stale, circuit breaker state, and a `cashflow.service.up` heartbeat per process.
- **Noise control**: no spans for health checks and documentation; database spans only inside a parent span, so the relay polling every 500 ms does not create empty traces.

## Alternatives considered

| Alternative                       | Why it was not chosen                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Vendor SDKs (Datadog, New Relic)  | Lock the code to a vendor; with OpenTelemetry, changing backend is Collector configuration                                                 |
| Elastic stack                     | Heavier to run locally                                                                                                                     |
| Custom correlation id header      | Does not integrate with tracing tools; W3C Trace Context is the standard                                                                   |
| Collect container log files       | Requires access to the Docker log directory; OTLP log export already carries trace ids                                                     |
| `target_info` for liveness alerts | Not exported by the Collector's Prometheus exporter in this setup; an explicit heartbeat metric is reliable (found when testing the alert) |

## Consequences

**Positive**

- End-to-end visibility of the asynchronous flow; the gap between the ledger commit and the publish span shows the time spent in the outbox.
- Measured consolidation lag: p50 0.26 s, p95 0.5 s; alerts were exercised locally (dead letter and service down).
- Backends are replaceable without touching services.

**Negative / trade-offs**

- Six more containers locally (Collector, Prometheus, Tempo, Loki, Grafana, k6 on demand).
- 100% trace sampling in the local setup; production needs ratio or tail sampling.
- `x-trace-id` cannot be asserted through Fastify's `inject` (async context is not propagated), so the header logic is tested with an injected trace id source and validated in the running stack.

## Evidence

- Bootstrap: [telemetry.ts](../../services/ledger/src/telemetry.ts)
- Trace context in events: [trace-context.ts](../../services/ledger/src/adapters/outbound/telemetry/trace-context.ts), [cloud-event.ts](../../packages/contracts/src/cloud-event.ts)
- Metrics: [outbox-metrics.ts](../../services/ledger/src/adapters/inbound/scheduler/outbox-metrics.ts), [consumer-metrics.ts](../../services/daily-balance/src/adapters/inbound/messaging/consumer-metrics.ts), [circuit-breaker-metrics.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaker-metrics.ts)
- Infrastructure: [otel-collector/config.yaml](../../infra/otel-collector/config.yaml), [alerts.yml](../../infra/prometheus/alerts.yml), [cash-flow.json dashboard](../../infra/grafana/dashboards/cash-flow.json)

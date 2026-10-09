# ADR-0006: RabbitMQ as the message broker

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Ledger events must reach the daily balance durably, survive broker restarts, support retries without blocking other messages, and park poison messages for inspection. The expected volume is tens of events per second. The solution must run locally with a single command.

## Decision

Use **RabbitMQ 4** with the following topology:

| Element                             | Type                    | Purpose                                                                 |
| ----------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `cash-flow.ledger.events`           | Topic exchange, durable | Published by the ledger; routing key is the event type                  |
| `daily-balance.ledger-events`       | Quorum queue            | Bound with `cashflow.ledger.entry.*.v1`; consumed by the daily balance  |
| `daily-balance.ledger-events.retry` | Quorum queue            | Delayed retry: per-message TTL, dead-letters back to the main queue     |
| `daily-balance.dead-letter`         | Direct exchange         | Receives messages that will not be retried                              |
| `daily-balance.ledger-events.dlq`   | Quorum queue            | Dead letter queue, with the reason in the `x-dead-letter-reason` header |

The consuming side owns its queues (the producer only knows the exchange), so new consumers can subscribe without changing the ledger. Client: `amqplib` 2.x with automatic connection recovery, confirm channels and prefetch.

## Alternatives considered

| Alternative             | Why it was not chosen                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Apache Kafka            | Strong for high throughput and replay, but the volume does not justify its operational cost; retry and DLQ must be built on top             |
| AWS SNS + SQS           | The equivalent managed option in production; not runnable locally without emulators. The hexagonal adapters make this a drop-in replacement |
| Redis Streams           | Lighter, but weaker durability guarantees and fewer routing features                                                                        |
| Classic mirrored queues | Deprecated in favour of quorum queues, which replicate with Raft and are recommended for data safety                                        |

## Consequences

**Positive**

- Native durability, routing, dead-lettering and per-message TTL cover retries and DLQ without custom infrastructure.
- Management UI and a Prometheus plugin expose queue depth (used by the `ConsumerBacklogGrowing` and `DeadLetterQueueNotEmpty` alerts).
- Easy to run locally (one container).

**Negative / trade-offs**

- No long-term replay like Kafka; recovery of consumers relies on the outbox (events can be republished, see [operations](../07-operations.md#backup-and-disaster-recovery)).
- Queue arguments cannot be changed after declaration without recreating the queue; the retry delay is therefore set per message (`expiration`) instead of as a queue argument.
- Message ordering is not guaranteed across retries; not needed because balance updates are commutative sums.

## Production target

RabbitMQ is the broker of the local environment and of the tests. In production, the [target architecture](../03-target-architecture.md#messaging-amazon-mq-for-rabbitmq-or-sns--sqs) recommends **SNS + SQS**: at a few million messages a month, a Multi-AZ Amazon MQ cluster would cost about as much as the rest of the platform ([cost estimate](../05-cost-estimate.md)). Because of the hexagonal architecture ([ADR-0003](0003-hexagonal-architecture.md)), the change is limited to a new publisher adapter for the `EventPublisher` port and a new consumer adapter that calls the same `LedgerMessageHandler`; the retry queue and DLQ map to visibility timeout, `maxReceiveCount` and a redrive policy. Amazon MQ for RabbitMQ remains the zero-code-change option for a faster first release.

## Evidence

- Consumer topology: [consumer-topology.ts](../../services/daily-balance/src/adapters/outbound/messaging/consumer-topology.ts)
- Consumer with retry and DLQ: [rabbitmq-ledger-event-consumer.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-ledger-event-consumer.ts)
- Connection recovery: [rabbitmq-connection.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-connection.ts)
- Queue metrics scraping: [prometheus.yml](../../infra/prometheus/prometheus.yml)

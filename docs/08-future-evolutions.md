# Future evolutions

The challenge welcomes a description of what would be implemented next. This document lists evolutions by theme and priority, and the known limitations of the current implementation.

Priority:

- **Now**: needed before a real production rollout.
- **Next**: valuable in the first months of operation.
- **Later**: depends on scale or product direction.

## Known limitations of the current implementation

| Limitation                                        | Why it is acceptable today                                   | Evolution                                                            |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Rate limiting is in memory, per replica           | One replica per process locally                              | Shared store (Redis) or API gateway limits                           |
| Password grant (ROPC) enabled on the client       | Needed for local scripts and load tests                      | Disable in production; Authorization Code with PKCE only             |
| 100% of traces sampled                            | Local volume is small                                        | Ratio or tail sampling in the Collector, always keeping error traces |
| Published outbox rows are never deleted           | Small volume; also useful to replay events                   | Cleanup job with a retention window                                  |
| Idempotency keys never expire                     | Small volume                                                 | Expiry after 24–72 h                                                 |
| Single currency (BRL)                             | The challenge describes one merchant in Brazil               | Multi-currency, see Data                                             |
| Consolidation lag bounded by the polling interval | p95 0.5 s, far below what a daily report needs               | `LISTEN/NOTIFY` wake-up or CDC                                       |
| Circuit breaker state per process                 | Each replica protects itself                                 | Acceptable; shared state is rarely worth it                          |
| Alerts with fixed thresholds, no Alertmanager     | Visible in Prometheus locally                                | Burn-rate alerts routed through Alertmanager                         |
| Stale cache entries can be served for up to 24 h  | Only during a database outage, signalled by `x-cache: STALE` | Tune per merchant needs                                              |

## Platform

| Priority | Evolution                                                                                                          | Rationale                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now      | Infrastructure as code (Terraform) for the target cloud (ECS/EKS, RDS, Amazon MQ or SQS, ElastiCache)              | Reproducible environments and reviewable infrastructure changes                                                                                                                 |
| Now      | SNS + SQS adapters for the production messaging target (publisher and consumer), with LocalStack integration tests | Production messaging at a fraction of the cost of a broker cluster; the ports and the message handler are reused as they are ([target architecture](03-target-architecture.md)) |
| Now      | CI/CD pipeline with lint, tests, coverage, image scanning and automated deploys                                    | Every change goes through the same quality gates                                                                                                                                |
| Next     | Kubernetes with Helm charts and GitOps (Argo CD) if the organization runs Kubernetes                               | Declarative deployments, rollbacks and drift detection                                                                                                                          |
| Next     | Canary or blue/green deployments with automatic rollback on SLO burn                                               | Limits the blast radius of a bad release                                                                                                                                        |
| Later    | Multi-region active/passive                                                                                        | Only if the business needs regional disaster tolerance beyond multi-AZ                                                                                                          |

## Messaging

| Priority | Evolution                                                              | Rationale                                                                                    |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Now      | Outbox cleanup job                                                     | Keeps the table small; the retention window must cover the replay needs of disaster recovery |
| Next     | `LISTEN/NOTIFY` to wake the relay, keeping polling as a safety net     | Near-zero publish latency with little operational cost                                       |
| Next     | Schema registry (Apicurio or Confluent) when more teams consume events | Contract governance and compatibility checks outside a single repository                     |
| Later    | CDC with Debezium reading the WAL instead of polling                   | Millisecond latency and no polling, worth it at much higher volume                           |
| Later    | Partitioning by merchant if ordered processing is ever required        | Today ordering is not needed because balance updates are commutative                         |

## Data

| Priority | Evolution                                                                                                                                                       | Rationale                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Next     | Historical import: a batch endpoint (separate scope and audit trail) that accepts entries older than the backdating window, with deterministic idempotency keys | Required to migrate a legacy system's history ([transition architecture](04-transition-architecture.md)); the regular API rightly rejects old business dates |
| Next     | Closing of business days and months (locking past periods)                                                                                                      | Accounting needs immutable closed periods; today entries can be backdated up to 30 days                                                                      |
| Next     | Read replicas for the daily balance database                                                                                                                    | Offload heavy period reports                                                                                                                                 |
| Later    | Monthly partitioning of `entries` and `applied_movements`                                                                                                       | Keeps indexes small and enables cheap archival                                                                                                               |
| Later    | Archival of closed periods to object storage                                                                                                                    | Lower storage cost, compliance retention                                                                                                                     |
| Later    | Multi-currency with explicit conversion rules                                                                                                                   | Merchants operating abroad; balances per currency                                                                                                            |

## Product features

| Priority | Evolution                                                                   | Rationale                                                                    |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Next     | Categories and cost centers for entries, with reports by category           | Turns the cash flow into a management tool                                   |
| Next     | Report export (CSV, PDF) and scheduled e-mail of the daily closing          | Common merchant request                                                      |
| Next     | Multiple users per merchant with fine-grained permissions                   | The role model already supports operator and viewer; extend to more profiles |
| Later    | Integrations with POS and payment acquirers via webhooks                    | Entries recorded automatically from sales and settlements                    |
| Later    | Bank reconciliation (OFX/CNAB import) matching statement lines with entries | Detects missing or duplicated entries                                        |
| Later    | Cash flow forecasting based on history and receivables                      | Helps merchants plan ahead                                                   |
| Later    | Notifications (low or negative balance, unusual movements)                  | Proactive value from the same events                                         |

## Quality

| Priority | Evolution                                                               | Rationale                                                                               |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Now      | Contract tests (Pact) for events and APIs                               | Detects breaking changes between producer and consumers before deployment               |
| Next     | Property-based tests for money, balance composition and business dates  | Explores edge cases (time zones, overflow, many movements) beyond hand-written examples |
| Next     | Load and resilience tests in the pipeline against a staging environment | Requirements verified on every release, not only locally                                |
| Later    | Mutation testing                                                        | Measures the strength of the test suite                                                 |
| Later    | Chaos experiments (network latency, broker partitions)                  | Validates behaviour beyond clean stop/start outages                                     |

## Security

| Priority | Evolution                                                               | Rationale                                              |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Now      | Secrets in a manager (AWS Secrets Manager, Vault) with rotation         | No credentials in configuration files                  |
| Now      | TLS everywhere; mTLS between services through a service mesh if adopted | Encryption in transit inside the network               |
| Next     | OAuth client credentials for system integrations (POS, acquirers)       | Machine identities separate from user identities       |
| Next     | WAF rules and bot protection at the edge                                | Protects the APIs before traffic reaches the services  |
| Next     | Audit log export to a SIEM                                              | Who recorded or reversed what, retained and searchable |

## Observability

| Priority | Evolution                                               | Rationale                                                             |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Now      | Alertmanager with routing by severity and runbook links | Alerts reach people; runbooks are in [operations](07-operations.md)   |
| Next     | SLO burn-rate alerts                                    | Alert on how fast the error budget is consumed, not on raw thresholds |
| Next     | Exemplars linking metric spikes to traces               | Jump from a latency spike to a slow trace                             |
| Later    | Cost dashboards per service                             | Keep the infrastructure cost visible next to usage                    |
| Later    | Real user monitoring once a frontend exists             | Measures the experience of the merchant, not only the API             |

## Developer experience

| Priority | Evolution                                             | Rationale                                            |
| -------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Next     | Web application for merchants (recording and reports) | The APIs are ready; a frontend completes the product |
| Next     | Client SDKs generated from the OpenAPI documents      | Integrators consume typed clients                    |
| Later    | Local development with hot reload inside containers   | Today services run with `tsx watch` outside Docker   |

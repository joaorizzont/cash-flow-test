# 05 — Infrastructure and License Cost Estimate

This document estimates the monthly cost to run the cash flow solution on AWS. The target architecture is described in [03-target-architecture.md](03-target-architecture.md). The workload comes from the requirements in [02-requirements.md](02-requirements.md).

> **These are estimates, not quotes.** All figures use approximate public **on-demand list prices for us-east-1 (N. Virginia)**. Prices change over time and vary by region, so treat every number as an order of magnitude. Before any budget decision, validate the configuration in the [AWS Pricing Calculator](https://calculator.aws/).

## 1. Method and assumptions

### 1.1 Conventions

| Item            | Value used                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hours per month | **730**                                                                                                                                                                 |
| Currency        | USD, before taxes                                                                                                                                                       |
| Pricing model   | On-demand, no Savings Plans or reservations (see [section 6](#6-cost-optimization))                                                                                     |
| Baseline region | us-east-1                                                                                                                                                               |
| Brazil region   | sa-east-1 (São Paulo), approximated by applying a factor of **1.4** to the us-east-1 totals. São Paulo is typically 30% to 50% more expensive, depending on the service |

Every line in the tables below shows its formula, so a reviewer can recompute it with current prices.

### 1.2 Reference unit prices (us-east-1, approximate)

| Service                               | Unit price used                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ECS on Fargate (Linux/x86)            | $0.04048 per vCPU-hour + $0.004445 per GB-hour (Linux/ARM is about 20% cheaper)                        |
| RDS for PostgreSQL, single-AZ         | db.t4g.micro ~$0.016/h · db.t4g.small ~$0.032/h · db.t4g.medium ~$0.065/h                              |
| RDS for PostgreSQL, Multi-AZ          | 2x the single-AZ price                                                                                 |
| RDS gp3 storage                       | ~$0.115 per GB-month single-AZ (2x for Multi-AZ)                                                       |
| RDS backup storage                    | Free up to the size of the database; ~$0.095 per GB-month beyond                                       |
| ElastiCache (Redis / Valkey)          | cache.t4g.micro ~$0.016/h · cache.t4g.small ~$0.032/h                                                  |
| Application Load Balancer             | ~$0.0225/h + ~$0.008 per LCU-hour                                                                      |
| API Gateway HTTP API                  | $1.00 per million requests                                                                             |
| NAT Gateway                           | ~$0.045/h + $0.045 per GB processed                                                                    |
| Amazon MQ for RabbitMQ                | mq.t3.micro ~$0.035/h (single instance, dev only) · mq.m5.large ~$0.288/h per node (cluster = 3 nodes) |
| SQS / SNS                             | SQS $0.40 per million requests (first 1M free) · SNS $0.50 per million publishes                       |
| Secrets Manager                       | $0.40 per secret-month                                                                                 |
| KMS                                   | ~$1 per customer managed key-month (requests negligible at this volume)                                |
| CloudWatch Logs                       | $0.50 per GB ingested                                                                                  |
| Amazon Managed Grafana                | ~$9 per editor-month · ~$5 per viewer-month                                                            |
| Amazon Managed Service for Prometheus | ~$0.90 per 10 million samples ingested                                                                 |
| S3 Standard                           | ~$0.023 per GB-month                                                                                   |
| AWS WAF                               | $5 per web ACL + $1 per rule + $0.60 per million requests                                              |
| Amazon Cognito (Essentials)           | First ~10,000 monthly active users free                                                                |

Fargate task sizes used below, with their monthly costs:

| Task size          | Formula                         | Hourly    | Monthly    |
| ------------------ | ------------------------------- | --------- | ---------- |
| 0.25 vCPU / 0.5 GB | 0.25 × 0.04048 + 0.5 × 0.004445 | $0.012343 | **$9.01**  |
| 0.5 vCPU / 1 GB    | 0.5 × 0.04048 + 1 × 0.004445    | $0.024685 | **$18.02** |
| 1 vCPU / 2 GB      | 1 × 0.04048 + 2 × 0.004445      | $0.049370 | **$36.04** |

### 1.3 Workload

| Assumption             | Baseline                                                                                      | Growth (10x) |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| Merchants              | One large merchant, or a few hundred small ones                                               | 10x          |
| Daily balance peak     | **50 req/s** (requirement)                                                                    | 500 req/s    |
| Daily balance average  | ~5 req/s                                                                                      | ~50 req/s    |
| Ledger writes, average | ~1.5 req/s (for example, 13 merchants with 10,000 entries a day each ≈ 130,000 entries a day) | ~15 req/s    |
| Requests per month     | ~13 million: 5 req/s reads + 1.5 req/s writes, × 2.6 million seconds                          | ~130 million |
| Events per month       | ~3.9 million: one per entry                                                                   | ~39 million  |

**Storage growth.** An entry row takes about 300 bytes. Indexes add roughly as much again, and the outbox row (the event payload) takes about 600 bytes until it is cleaned up. That gives about 1.2 KB per entry while the outbox row exists and about 0.6 KB after cleanup. On the consolidated side, each entry also creates one `applied_movements` row of about 0.5 KB, while `daily_balances` stays tiny (one row per merchant per day).

| Scenario                      | Ledger growth                                       | Daily balance growth |
| ----------------------------- | --------------------------------------------------- | -------------------- |
| Baseline (3.9M entries/month) | ~4.7 GB/month, or ~2.3 GB/month with outbox cleanup | ~2 GB/month          |
| Growth (39M entries/month)    | ~23 GB/month with outbox cleanup                    | ~20 GB/month         |

The outbox cleanup job is listed in [08-future-evolutions.md](08-future-evolutions.md). Phase 8 measured that a single replica of the daily-balance API served 400 req/s with p95 of 20.9 ms, on a laptop that was also running the load generator. Small tasks are therefore enough, and the task counts below are driven by high availability, not by CPU.

## 2. Licenses

Every component of the solution is open source, so the **license cost is $0**.

| Component                                         | License                                    |
| ------------------------------------------------- | ------------------------------------------ |
| Node.js, Fastify, pino, TypeBox, Zod, amqplib, pg | MIT                                        |
| PostgreSQL                                        | PostgreSQL License                         |
| RabbitMQ                                          | MPL 2.0                                    |
| Redis 7 (as used locally) / Valkey                | BSD (Redis ≤ 7.2) / BSD (Valkey)           |
| Keycloak                                          | Apache 2.0                                 |
| OpenTelemetry, Prometheus                         | Apache 2.0                                 |
| Grafana, Tempo, Loki, k6                          | AGPL 3.0 (no license fee when self-hosted) |

Optional paid alternatives, in case operating the open-source stack is not desired:

| Alternative                        | Pricing model                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Grafana Cloud                      | Free tier, then usage-based (metrics series, logs GB, traces GB)               |
| Datadog / New Relic                | Per host or per GB ingested; usually the most expensive option at scale        |
| Amazon MQ                          | An infrastructure cost (broker hours), not a license                           |
| Amazon Cognito instead of Keycloak | Per monthly active user; the first ~10,000 MAU are free on the Essentials tier |

## 3. Tier A — Development / staging

Single-AZ with the smallest sizes. Non-production environments can be stopped outside working hours (see [section 6](#6-cost-optimization)).

| Component                              | AWS service              | Sizing and formula                                            | Monthly     |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------- | ----------- |
| ledger, relay, daily-balance, consumer | ECS Fargate              | 4 tasks × 0.25 vCPU / 0.5 GB → 4 × $9.01                      | $36.04      |
| Keycloak                               | ECS Fargate              | 1 task × 0.5 vCPU / 1 GB (JVM) → 1 × $18.02                   | $18.02      |
| Ledger database                        | RDS PostgreSQL single-AZ | db.t4g.micro → 0.016 × 730 (also hosts the Keycloak database) | $11.68      |
| Daily balance database                 | RDS PostgreSQL single-AZ | db.t4g.micro → 0.016 × 730                                    | $11.68      |
| Database storage                       | RDS gp3                  | 2 × 20 GB × $0.115                                            | $4.60       |
| Backups                                | RDS                      | Within the free allowance (≤ database size)                   | $0.00       |
| Message broker                         | Amazon MQ for RabbitMQ   | mq.t3.micro single instance → 0.035 × 730                     | $25.55      |
| Cache                                  | ElastiCache              | 1 × cache.t4g.micro → 0.016 × 730                             | $11.68      |
| Load balancer                          | ALB                      | 0.0225 × 730 + 1 LCU × 0.008 × 730                            | $22.27      |
| Outbound internet                      | NAT Gateway              | 1 × 0.045 × 730 + 10 GB × 0.045                               | $33.30      |
| Secrets                                | Secrets Manager          | 6 secrets × $0.40                                             | $2.40       |
| Encryption keys                        | KMS                      | 1 key                                                         | $1.00       |
| Logs                                   | CloudWatch Logs          | 5 GB × $0.50 (dashboards run with the local Docker stack)     | $2.50       |
| Data transfer                          | —                        | Minimal                                                       | $1.00       |
| **Total**                              |                          |                                                               | **$181.72** |

If the Fargate tasks run only 12 hours a day on weekdays (about 260 of 730 hours), the compute line falls from $54.06 to about $19, and the tier comes to about **$147/month**. RDS instances can also be stopped for up to 7 days at a time.

## 4. Tier B — Production baseline (high availability)

Multi-AZ databases, at least 2 tasks per service spread over 2 Availability Zones, and managed observability.

| Component                  | AWS service               | Sizing and formula                                                                                                               | Monthly     |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| ledger API                 | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                                                 | $36.04      |
| daily-balance API          | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                                                 | $36.04      |
| ledger-outbox-relay        | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB (safe thanks to `SKIP LOCKED`) → 2 × $9.01                                                                | $18.02      |
| daily-balance-consumer     | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB → 2 × $9.01                                                                                               | $18.02      |
| Keycloak                   | ECS Fargate               | 2 × 1 vCPU / 2 GB → 2 × $36.04                                                                                                   | $72.08      |
| OpenTelemetry Collector    | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB → 2 × $9.01                                                                                               | $18.02      |
| Ledger database            | RDS PostgreSQL Multi-AZ   | db.t4g.small → 0.032 × 2 × 730                                                                                                   | $46.72      |
| Daily balance database     | RDS PostgreSQL Multi-AZ   | db.t4g.small → 0.032 × 2 × 730                                                                                                   | $46.72      |
| Keycloak database          | RDS PostgreSQL Multi-AZ   | db.t4g.micro → 0.016 × 2 × 730                                                                                                   | $23.36      |
| Database storage           | RDS gp3 Multi-AZ          | (50 + 20 + 20) GB × $0.115 × 2                                                                                                   | $20.70      |
| Backups                    | RDS                       | 7-day retention; 50 GB beyond the free allowance × $0.095                                                                        | $4.75       |
| Messaging (recommended)    | SNS + SQS                 | SNS: 2.9M billable publishes × $0.50/M ≈ $1.45; SQS: ~11.7M requests (send, receive, delete) − 1M free = 10.7M × $0.40/M ≈ $4.28 | $5.73       |
| Cache                      | ElastiCache               | cache.t4g.small primary + replica → 2 × 0.032 × 730                                                                              | $46.72      |
| Load balancer              | ALB                       | 0.0225 × 730 + 2 LCU × 0.008 × 730                                                                                               | $28.11      |
| Outbound internet          | NAT Gateway               | 2 AZs × 0.045 × 730 + 50 GB × 0.045                                                                                              | $67.95      |
| Edge protection            | AWS WAF                   | $5 ACL + 5 rules × $1 + 13M × $0.60/M                                                                                            | $17.80      |
| Secrets                    | Secrets Manager           | 10 secrets × $0.40                                                                                                               | $4.00       |
| Encryption keys            | KMS                       | 3 keys (databases, cache, logs and backups)                                                                                      | $3.00       |
| Metrics                    | Amazon Managed Prometheus | ~2,000 series × 4 samples/min × 43,200 min ≈ 346M samples → 34.6 × $0.90                                                         | $31.10      |
| Dashboards                 | Amazon Managed Grafana    | 1 editor × $9 + 3 viewers × $5                                                                                                   | $24.00      |
| Logs                       | CloudWatch Logs           | 30 GB × $0.50                                                                                                                    | $15.00      |
| Traces                     | Tempo on Fargate + S3     | 1 × 0.5 vCPU / 1 GB ($18.02) + 50 GB × $0.023 ($1.15)                                                                            | $19.17      |
| Data transfer              | —                         | Responses ≈ 26 GB, within the 100 GB monthly free allowance; ~100 GB inter-AZ × $0.02                                            | $2.00       |
| **Total (with SNS + SQS)** |                           |                                                                                                                                  | **$605.32** |

The messaging line deserves a comparison:

| Option                                  | Sizing and formula                | Monthly   | When to choose                                                                         |
| --------------------------------------- | --------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| SNS + SQS                               | Calculated above                  | **$5.73** | Recommended. Serverless, Multi-AZ by default, with native DLQ through a redrive policy |
| Amazon MQ for RabbitMQ, single instance | mq.m5.large × 1 → 0.288 × 730     | $210.24   | Not recommended for production: a single broker means no high availability             |
| Amazon MQ for RabbitMQ, 3-node cluster  | mq.m5.large × 3 → 0.288 × 3 × 730 | $630.72   | When the RabbitMQ semantics must be kept without change                                |

With the Amazon MQ cluster instead of SNS + SQS, the tier costs **$1,230.31/month**. Switching to SQS does not touch the domain or the use cases: the hexagonal architecture confines it to a new publisher adapter (implementing the `EventPublisher` port) and a new consumer adapter. The retry queue and the DLQ map to the SQS visibility timeout and redrive policy. See [adr/0006-rabbitmq-message-broker.md](adr/0006-rabbitmq-message-broker.md).

Replacing self-hosted Keycloak with Amazon Cognito would remove the Keycloak tasks, its database and its storage (about $100/month) for up to ~10,000 monthly active users. The trade-off is less control over the realm configuration kept as code. See [adr/0011-keycloak-jwt-scopes.md](adr/0011-keycloak-jwt-scopes.md).

## 5. Tier C — Production growth (10x volume)

Peak of 500 req/s on the daily balance, 15 writes/s on average, and ~130 million requests per month.

| Component                  | AWS service               | Sizing and formula                                                                       | Monthly       |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| ledger API                 | ECS Fargate               | 4 × 1 vCPU / 2 GB → 4 × $36.04                                                           | $144.16       |
| daily-balance API          | ECS Fargate               | 4 × 1 vCPU / 2 GB → 4 × $36.04                                                           | $144.16       |
| ledger-outbox-relay        | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                         | $36.04        |
| daily-balance-consumer     | ECS Fargate               | 3 × 0.5 vCPU / 1 GB → 3 × $18.02                                                         | $54.06        |
| Keycloak                   | ECS Fargate               | 2 × 1 vCPU / 2 GB → 2 × $36.04                                                           | $72.08        |
| OpenTelemetry Collector    | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                         | $36.04        |
| Ledger database            | RDS PostgreSQL Multi-AZ   | db.t4g.medium → 0.065 × 2 × 730                                                          | $94.90        |
| Daily balance database     | RDS PostgreSQL Multi-AZ   | db.t4g.medium → 0.065 × 2 × 730                                                          | $94.90        |
| Keycloak database          | RDS PostgreSQL Multi-AZ   | db.t4g.micro → 0.016 × 2 × 730                                                           | $23.36        |
| Database storage           | RDS gp3 Multi-AZ          | (300 + 200 + 20) GB × $0.115 × 2                                                         | $119.60       |
| Backups                    | RDS                       | 300 GB beyond the free allowance × $0.095                                                | $28.50        |
| Messaging                  | SNS + SQS                 | SNS: 38M × $0.50/M = $19.00; SQS: 116M × $0.40/M = $46.40                                | $65.40        |
| Cache                      | ElastiCache               | cache.t4g.small primary + 2 replicas → 3 × 0.032 × 730                                   | $70.08        |
| Load balancer              | ALB                       | 0.0225 × 730 + 10 LCU × 0.008 × 730                                                      | $74.83        |
| Outbound internet          | NAT Gateway               | 2 × 0.045 × 730 + 300 GB × 0.045 (AWS traffic goes through VPC endpoints)                | $79.20        |
| Edge protection            | AWS WAF                   | $10 + 130M × $0.60/M                                                                     | $88.00        |
| Secrets and keys           | Secrets Manager + KMS     | 10 × $0.40 + 3 × $1                                                                      | $7.00         |
| Metrics                    | Amazon Managed Prometheus | ~864M samples (more tasks; series grow with task count, not with traffic) → 86.4 × $0.90 | $77.76        |
| Dashboards                 | Amazon Managed Grafana    | 1 editor + 5 viewers                                                                     | $34.00        |
| Logs                       | CloudWatch Logs           | 200 GB × $0.50 (with log level and retention policies)                                   | $100.00       |
| Traces                     | Tempo on Fargate + S3     | 2 × $18.02 + 300 GB × $0.023 (sampled)                                                   | $42.94        |
| Data transfer              | —                         | ~160 GB beyond the free allowance × $0.09 + inter-AZ ~$10                                | $24.40        |
| **Total (with SNS + SQS)** |                           |                                                                                          | **$1,511.41** |

With the 3-node Amazon MQ cluster instead of SNS + SQS: **$2,076.73/month**.

## 6. Cost optimization

| Lever                                     | Expected effect                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute Savings Plans                     | Up to ~50% on Fargate with a 3-year commitment; ~20% to 30% with 1 year and no upfront payment                                                                                                                                  |
| Graviton (ARM) tasks                      | ~20% cheaper Fargate. The `node:22-alpine` image is multi-arch, so the Dockerfile works as is                                                                                                                                   |
| RDS Reserved Instances                    | ~30% to 40% on the database instances with a 1-year term                                                                                                                                                                        |
| Right-sizing from measured capacity       | Phase 8 measured 400 req/s on one replica, about 8x the required peak. Keep tasks small and let auto scaling add replicas on CPU or request count instead of pre-provisioning                                                   |
| Scale non-production to zero at night     | Shown in tier A: ~$35/month saved on compute alone; schedule RDS stop and start as well                                                                                                                                         |
| SNS + SQS instead of an Amazon MQ cluster | ~$625/month less in tier B. Only new adapters are needed (hexagonal architecture)                                                                                                                                               |
| VPC endpoints instead of NAT traffic      | Gateway endpoints (S3) are free; interface endpoints (ECR, Secrets Manager, CloudWatch, SQS) cost ~$7.30 per endpoint per AZ each month and remove NAT data processing charges. Worth it once NAT data exceeds a few hundred GB |
| Log retention and log levels              | 7 to 14 days in CloudWatch for application logs, then archive to S3; `info` level in production; no logs for health checks (already the case)                                                                                   |
| Trace sampling                            | `parentbased_traceidratio` at 10% or tail sampling in the Collector that keeps every error trace; storage drops roughly in proportion                                                                                           |
| Outbox cleanup job                        | Halves the ledger storage growth (see [section 1.3](#13-workload))                                                                                                                                                              |
| Cognito instead of Keycloak               | ~$100/month saved for up to ~10,000 monthly active users                                                                                                                                                                        |

With a 1-year Compute Savings Plan on Fargate (~25%), RDS reservations (~35%) and Graviton, tier B falls to roughly **$500/month** in us-east-1.

## 7. Summary

| Tier                         | us-east-1 (SNS + SQS) | sa-east-1 approximation (× 1.4) | us-east-1 (Amazon MQ cluster)           | sa-east-1 approximation (× 1.4) |
| ---------------------------- | --------------------- | ------------------------------- | --------------------------------------- | ------------------------------- |
| A — Development / staging    | **$181.72**           | **$254.41**                     | — (single mq.t3.micro already included) | —                               |
| B — Production baseline (HA) | **$605.32**           | **$847.45**                     | $1,230.31                               | $1,722.43                       |
| C — Production growth (10x)  | **$1,511.41**         | **$2,115.97**                   | $2,076.73                               | $2,907.42                       |

The São Paulo column applies a single factor of 1.4 to the whole bill. It is an approximation; real sa-east-1 prices differ by service.

### Recommendation

- **Start with tier B in sa-east-1** (about $850/month on demand, about $700/month with Savings Plans and reservations). It keeps financial data in Brazil, which simplifies LGPD compliance.
- **Use SNS + SQS rather than an Amazon MQ cluster** in production. The broker cluster would cost about as much as the rest of the platform, for a volume of a few million messages a month.
- **Keep the database instances small and scale the stateless services horizontally.** The measured capacity shows that the bottleneck is far away. The main cost drivers are fixed costs (Multi-AZ databases, NAT and observability), not traffic.
- **Re-evaluate Keycloak versus Cognito** once the number of users and the need for realm customization are known.

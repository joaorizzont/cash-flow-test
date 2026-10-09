# 05 — Estimativa de custos de infraestrutura e licenças

Este documento estima o custo mensal para rodar a solução de fluxo de caixa na AWS. A arquitetura alvo está descrita em [03-target-architecture.md](03-target-architecture.md). A carga de trabalho vem dos requisitos em [02-requirements.md](02-requirements.md).

> **São estimativas, não cotações.** Todos os valores usam **preços públicos de lista on-demand aproximados de us-east-1 (N. Virginia)**. Os preços mudam com o tempo e variam por região, então trate cada número como uma ordem de grandeza. Antes de qualquer decisão de orçamento, valide a configuração na [AWS Pricing Calculator](https://calculator.aws/).

## 1. Método e premissas

### 1.1 Convenções

| Item             | Valor utilizado                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Horas por mês    | **730**                                                                                                                                                           |
| Moeda            | Dólar americano (US$), sem impostos                                                                                                                               |
| Modelo de preço  | On-demand, sem Savings Plans nem reservas (veja a [seção 6](#6-otimização-de-custos))                                                                             |
| Região de base   | us-east-1                                                                                                                                                         |
| Região no Brasil | sa-east-1 (São Paulo), aproximada aplicando um fator de **1,4** sobre os totais de us-east-1. São Paulo costuma ser de 30% a 50% mais cara, dependendo do serviço |

Cada linha das tabelas abaixo mostra sua fórmula, para que quem revisar possa recalculá-la com os preços atuais.

### 1.2 Preços unitários de referência (us-east-1, aproximados)

| Serviço                               | Preço unitário utilizado                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ECS on Fargate (Linux/x86)            | $0.04048 por vCPU-hora + $0.004445 por GB-hora (Linux/ARM é cerca de 20% mais barato)                    |
| RDS for PostgreSQL, single-AZ         | db.t4g.micro ~$0.016/h · db.t4g.small ~$0.032/h · db.t4g.medium ~$0.065/h                                |
| RDS for PostgreSQL, Multi-AZ          | 2x o preço single-AZ                                                                                     |
| Armazenamento RDS gp3                 | ~$0.115 por GB-mês single-AZ (2x em Multi-AZ)                                                            |
| Armazenamento de backup RDS           | Gratuito até o tamanho do banco; ~$0.095 por GB-mês acima disso                                          |
| ElastiCache (Redis / Valkey)          | cache.t4g.micro ~$0.016/h · cache.t4g.small ~$0.032/h                                                    |
| Application Load Balancer             | ~$0.0225/h + ~$0.008 por LCU-hora                                                                        |
| API Gateway HTTP API                  | $1.00 por milhão de requisições                                                                          |
| NAT Gateway                           | ~$0.045/h + $0.045 por GB processado                                                                     |
| Amazon MQ for RabbitMQ                | mq.t3.micro ~$0.035/h (instância única, apenas dev) · mq.m5.large ~$0.288/h por nó (cluster = 3 nós)     |
| SQS / SNS                             | SQS $0.40 por milhão de requisições (o primeiro milhão é gratuito) · SNS $0.50 por milhão de publicações |
| Secrets Manager                       | $0.40 por segredo-mês                                                                                    |
| KMS                                   | ~$1 por chave gerenciada pelo cliente por mês (requisições desprezíveis neste volume)                    |
| CloudWatch Logs                       | $0.50 por GB ingerido                                                                                    |
| Amazon Managed Grafana                | ~$9 por editor-mês · ~$5 por visualizador-mês                                                            |
| Amazon Managed Service for Prometheus | ~$0.90 por 10 milhões de amostras ingeridas                                                              |
| S3 Standard                           | ~$0.023 por GB-mês                                                                                       |
| AWS WAF                               | $5 por web ACL + $1 por regra + $0.60 por milhão de requisições                                          |
| Amazon Cognito (Essentials)           | Os primeiros ~10.000 usuários ativos mensais são gratuitos                                               |

Tamanhos de task do Fargate usados abaixo, com seus custos mensais:

| Tamanho da task    | Fórmula                         | Por hora  | Por mês    |
| ------------------ | ------------------------------- | --------- | ---------- |
| 0.25 vCPU / 0.5 GB | 0.25 × 0.04048 + 0.5 × 0.004445 | $0.012343 | **$9.01**  |
| 0.5 vCPU / 1 GB    | 0.5 × 0.04048 + 1 × 0.004445    | $0.024685 | **$18.02** |
| 1 vCPU / 2 GB      | 1 × 0.04048 + 2 × 0.004445      | $0.049370 | **$36.04** |

### 1.3 Carga de trabalho

| Premissa                   | Base                                                                                                        | Crescimento (10x) |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| Comerciantes               | Um comerciante grande, ou algumas centenas de pequenos                                                      | 10x               |
| Pico do consolidado        | **50 req/s** (requisito)                                                                                    | 500 req/s         |
| Média do consolidado       | ~5 req/s                                                                                                    | ~50 req/s         |
| Gravações no ledger, média | ~1,5 req/s (por exemplo, 13 comerciantes com 10.000 lançamentos por dia cada ≈ 130.000 lançamentos por dia) | ~15 req/s         |
| Requisições por mês        | ~13 milhões: 5 req/s de leitura + 1,5 req/s de gravação, × 2,6 milhões de segundos                          | ~130 milhões      |
| Eventos por mês            | ~3,9 milhões: um por lançamento                                                                             | ~39 milhões       |

**Crescimento do armazenamento.** Uma linha de lançamento ocupa cerca de 300 bytes. Os índices acrescentam aproximadamente o mesmo, e a linha do outbox (o payload do evento) ocupa cerca de 600 bytes até ser limpa. Isso dá cerca de 1,2 KB por lançamento enquanto a linha do outbox existe e cerca de 0,6 KB depois da limpeza. No lado do consolidado, cada lançamento também cria uma linha em `applied_movements` de cerca de 0,5 KB, enquanto `daily_balances` continua minúscula (uma linha por comerciante por dia).

| Cenário                           | Crescimento do ledger                               | Crescimento do consolidado |
| --------------------------------- | --------------------------------------------------- | -------------------------- |
| Base (3,9M lançamentos/mês)       | ~4,7 GB/mês, ou ~2,3 GB/mês com a limpeza do outbox | ~2 GB/mês                  |
| Crescimento (39M lançamentos/mês) | ~23 GB/mês com a limpeza do outbox                  | ~20 GB/mês                 |

O job de limpeza do outbox está listado em [08-future-evolutions.md](08-future-evolutions.md). A Fase 8 mediu que uma única réplica da API do daily-balance atendeu 400 req/s com p95 de 20,9 ms, em um notebook que também rodava o gerador de carga. Tasks pequenas são, portanto, suficientes, e a quantidade de tasks abaixo é definida pela alta disponibilidade, não pela CPU.

## 2. Licenças

Todos os componentes da solução são open source, então o **custo de licenças é $0**.

| Componente                                        | Licença                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| Node.js, Fastify, pino, TypeBox, Zod, amqplib, pg | MIT                                                    |
| PostgreSQL                                        | PostgreSQL License                                     |
| RabbitMQ                                          | MPL 2.0                                                |
| Redis 7 (como usado localmente) / Valkey          | BSD (Redis ≤ 7.2) / BSD (Valkey)                       |
| Keycloak                                          | Apache 2.0                                             |
| OpenTelemetry, Prometheus                         | Apache 2.0                                             |
| Grafana, Tempo, Loki, k6                          | AGPL 3.0 (sem custo de licença quando auto-hospedados) |

Alternativas pagas opcionais, caso não se queira operar a stack open source:

| Alternativa                       | Modelo de preço                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Grafana Cloud                     | Camada gratuita, depois cobrança por uso (séries de métricas, GB de logs, GB de traces) |
| Datadog / New Relic               | Por host ou por GB ingerido; geralmente a opção mais cara em escala                     |
| Amazon MQ                         | Um custo de infraestrutura (horas de broker), não de licença                            |
| Amazon Cognito em vez do Keycloak | Por usuário ativo mensal; os primeiros ~10.000 MAU são gratuitos na camada Essentials   |

## 3. Tier A — Desenvolvimento / homologação

Single-AZ com os menores tamanhos. Ambientes que não são de produção podem ser desligados fora do horário de trabalho (veja a [seção 6](#6-otimização-de-custos)).

| Componente                             | Serviço AWS              | Dimensionamento e fórmula                                       | Por mês     |
| -------------------------------------- | ------------------------ | --------------------------------------------------------------- | ----------- |
| ledger, relay, daily-balance, consumer | ECS Fargate              | 4 tasks × 0.25 vCPU / 0.5 GB → 4 × $9.01                        | $36.04      |
| Keycloak                               | ECS Fargate              | 1 task × 0.5 vCPU / 1 GB (JVM) → 1 × $18.02                     | $18.02      |
| Banco do ledger                        | RDS PostgreSQL single-AZ | db.t4g.micro → 0.016 × 730 (também hospeda o banco do Keycloak) | $11.68      |
| Banco do consolidado                   | RDS PostgreSQL single-AZ | db.t4g.micro → 0.016 × 730                                      | $11.68      |
| Armazenamento dos bancos               | RDS gp3                  | 2 × 20 GB × $0.115                                              | $4.60       |
| Backups                                | RDS                      | Dentro da franquia gratuita (≤ tamanho do banco)                | $0.00       |
| Broker de mensagens                    | Amazon MQ for RabbitMQ   | mq.t3.micro instância única → 0.035 × 730                       | $25.55      |
| Cache                                  | ElastiCache              | 1 × cache.t4g.micro → 0.016 × 730                               | $11.68      |
| Load balancer                          | ALB                      | 0.0225 × 730 + 1 LCU × 0.008 × 730                              | $22.27      |
| Saída para a internet                  | NAT Gateway              | 1 × 0.045 × 730 + 10 GB × 0.045                                 | $33.30      |
| Segredos                               | Secrets Manager          | 6 segredos × $0.40                                              | $2.40       |
| Chaves de criptografia                 | KMS                      | 1 chave                                                         | $1.00       |
| Logs                                   | CloudWatch Logs          | 5 GB × $0.50 (os dashboards rodam com a stack Docker local)     | $2.50       |
| Transferência de dados                 | —                        | Mínima                                                          | $1.00       |
| **Total**                              |                          |                                                                 | **$181.72** |

Se as tasks do Fargate rodarem só 12 horas por dia em dias úteis (cerca de 260 de 730 horas), a linha de computação cai de $54.06 para cerca de $19, e o tier fica em cerca de **$147/mês**. As instâncias RDS também podem ser paradas por até 7 dias seguidos.

## 4. Tier B — Produção base (alta disponibilidade)

Bancos Multi-AZ, ao menos 2 tasks por serviço distribuídas em 2 Availability Zones e observabilidade gerenciada.

| Componente                | Serviço AWS               | Dimensionamento e fórmula                                                                                                                        | Por mês     |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| API do ledger             | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                                                                 | $36.04      |
| API do daily-balance      | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                                                                 | $36.04      |
| ledger-outbox-relay       | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB (seguro graças ao `SKIP LOCKED`) → 2 × $9.01                                                                              | $18.02      |
| daily-balance-consumer    | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB → 2 × $9.01                                                                                                               | $18.02      |
| Keycloak                  | ECS Fargate               | 2 × 1 vCPU / 2 GB → 2 × $36.04                                                                                                                   | $72.08      |
| OpenTelemetry Collector   | ECS Fargate               | 2 × 0.25 vCPU / 0.5 GB → 2 × $9.01                                                                                                               | $18.02      |
| Banco do ledger           | RDS PostgreSQL Multi-AZ   | db.t4g.small → 0.032 × 2 × 730                                                                                                                   | $46.72      |
| Banco do consolidado      | RDS PostgreSQL Multi-AZ   | db.t4g.small → 0.032 × 2 × 730                                                                                                                   | $46.72      |
| Banco do Keycloak         | RDS PostgreSQL Multi-AZ   | db.t4g.micro → 0.016 × 2 × 730                                                                                                                   | $23.36      |
| Armazenamento dos bancos  | RDS gp3 Multi-AZ          | (50 + 20 + 20) GB × $0.115 × 2                                                                                                                   | $20.70      |
| Backups                   | RDS                       | Retenção de 7 dias; 50 GB além da franquia gratuita × $0.095                                                                                     | $4.75       |
| Mensageria (recomendada)  | SNS + SQS                 | SNS: 2,9M publicações cobradas × $0.50/M ≈ $1.45; SQS: ~11,7M requisições (envio, recebimento, exclusão) − 1M gratuito = 10,7M × $0.40/M ≈ $4.28 | $5.73       |
| Cache                     | ElastiCache               | cache.t4g.small primário + réplica → 2 × 0.032 × 730                                                                                             | $46.72      |
| Load balancer             | ALB                       | 0.0225 × 730 + 2 LCU × 0.008 × 730                                                                                                               | $28.11      |
| Saída para a internet     | NAT Gateway               | 2 AZs × 0.045 × 730 + 50 GB × 0.045                                                                                                              | $67.95      |
| Proteção de borda         | AWS WAF                   | $5 ACL + 5 regras × $1 + 13M × $0.60/M                                                                                                           | $17.80      |
| Segredos                  | Secrets Manager           | 10 segredos × $0.40                                                                                                                              | $4.00       |
| Chaves de criptografia    | KMS                       | 3 chaves (bancos, cache, logs e backups)                                                                                                         | $3.00       |
| Métricas                  | Amazon Managed Prometheus | ~2.000 séries × 4 amostras/min × 43.200 min ≈ 346M amostras → 34,6 × $0.90                                                                       | $31.10      |
| Dashboards                | Amazon Managed Grafana    | 1 editor × $9 + 3 visualizadores × $5                                                                                                            | $24.00      |
| Logs                      | CloudWatch Logs           | 30 GB × $0.50                                                                                                                                    | $15.00      |
| Traces                    | Tempo no Fargate + S3     | 1 × 0.5 vCPU / 1 GB ($18.02) + 50 GB × $0.023 ($1.15)                                                                                            | $19.17      |
| Transferência de dados    | —                         | Respostas ≈ 26 GB, dentro da franquia gratuita mensal de 100 GB; ~100 GB entre AZs × $0.02                                                       | $2.00       |
| **Total (com SNS + SQS)** |                           |                                                                                                                                                  | **$605.32** |

A linha de mensageria merece uma comparação:

| Opção                                    | Dimensionamento e fórmula         | Por mês   | Quando escolher                                                                             |
| ---------------------------------------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| SNS + SQS                                | Calculado acima                   | **$5.73** | Recomendada. Serverless, Multi-AZ por padrão, com DLQ nativa por meio de uma redrive policy |
| Amazon MQ for RabbitMQ, instância única  | mq.m5.large × 1 → 0.288 × 730     | $210.24   | Não recomendada para produção: um único broker significa ausência de alta disponibilidade   |
| Amazon MQ for RabbitMQ, cluster de 3 nós | mq.m5.large × 3 → 0.288 × 3 × 730 | $630.72   | Quando a semântica do RabbitMQ precisar ser mantida sem mudanças                            |

Com o cluster do Amazon MQ no lugar de SNS + SQS, o tier custa **$1,230.31/mês**. A troca para SQS não toca o domínio nem os casos de uso: a arquitetura hexagonal a restringe a um novo adapter de publicação (que implementa o port `EventPublisher`) e a um novo adapter de consumo. A fila de espera e a DLQ correspondem ao visibility timeout e à redrive policy do SQS. Veja [adr/0006-rabbitmq-message-broker.md](adr/0006-rabbitmq-message-broker.md).

Substituir o Keycloak auto-hospedado pelo Amazon Cognito eliminaria as tasks do Keycloak, seu banco e seu armazenamento (cerca de $100/mês) para até ~10.000 usuários ativos mensais. A contrapartida é menos controle sobre a configuração do realm mantida como código. Veja [adr/0011-keycloak-jwt-scopes.md](adr/0011-keycloak-jwt-scopes.md).

## 5. Tier C — Produção em crescimento (10x o volume)

Pico de 500 req/s no consolidado, 15 gravações/s em média e ~130 milhões de requisições por mês.

| Componente                | Serviço AWS               | Dimensionamento e fórmula                                                                              | Por mês       |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| API do ledger             | ECS Fargate               | 4 × 1 vCPU / 2 GB → 4 × $36.04                                                                         | $144.16       |
| API do daily-balance      | ECS Fargate               | 4 × 1 vCPU / 2 GB → 4 × $36.04                                                                         | $144.16       |
| ledger-outbox-relay       | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                       | $36.04        |
| daily-balance-consumer    | ECS Fargate               | 3 × 0.5 vCPU / 1 GB → 3 × $18.02                                                                       | $54.06        |
| Keycloak                  | ECS Fargate               | 2 × 1 vCPU / 2 GB → 2 × $36.04                                                                         | $72.08        |
| OpenTelemetry Collector   | ECS Fargate               | 2 × 0.5 vCPU / 1 GB → 2 × $18.02                                                                       | $36.04        |
| Banco do ledger           | RDS PostgreSQL Multi-AZ   | db.t4g.medium → 0.065 × 2 × 730                                                                        | $94.90        |
| Banco do consolidado      | RDS PostgreSQL Multi-AZ   | db.t4g.medium → 0.065 × 2 × 730                                                                        | $94.90        |
| Banco do Keycloak         | RDS PostgreSQL Multi-AZ   | db.t4g.micro → 0.016 × 2 × 730                                                                         | $23.36        |
| Armazenamento dos bancos  | RDS gp3 Multi-AZ          | (300 + 200 + 20) GB × $0.115 × 2                                                                       | $119.60       |
| Backups                   | RDS                       | 300 GB além da franquia gratuita × $0.095                                                              | $28.50        |
| Mensageria                | SNS + SQS                 | SNS: 38M × $0.50/M = $19.00; SQS: 116M × $0.40/M = $46.40                                              | $65.40        |
| Cache                     | ElastiCache               | cache.t4g.small primário + 2 réplicas → 3 × 0.032 × 730                                                | $70.08        |
| Load balancer             | ALB                       | 0.0225 × 730 + 10 LCU × 0.008 × 730                                                                    | $74.83        |
| Saída para a internet     | NAT Gateway               | 2 × 0.045 × 730 + 300 GB × 0.045 (o tráfego para a AWS passa por VPC endpoints)                        | $79.20        |
| Proteção de borda         | AWS WAF                   | $10 + 130M × $0.60/M                                                                                   | $88.00        |
| Segredos e chaves         | Secrets Manager + KMS     | 10 × $0.40 + 3 × $1                                                                                    | $7.00         |
| Métricas                  | Amazon Managed Prometheus | ~864M amostras (mais tasks; as séries crescem com o número de tasks, não com o tráfego) → 86,4 × $0.90 | $77.76        |
| Dashboards                | Amazon Managed Grafana    | 1 editor + 5 visualizadores                                                                            | $34.00        |
| Logs                      | CloudWatch Logs           | 200 GB × $0.50 (com políticas de nível de log e retenção)                                              | $100.00       |
| Traces                    | Tempo no Fargate + S3     | 2 × $18.02 + 300 GB × $0.023 (com amostragem)                                                          | $42.94        |
| Transferência de dados    | —                         | ~160 GB além da franquia gratuita × $0.09 + entre AZs ~$10                                             | $24.40        |
| **Total (com SNS + SQS)** |                           |                                                                                                        | **$1,511.41** |

Com o cluster de 3 nós do Amazon MQ no lugar de SNS + SQS: **$2,076.73/mês**.

## 6. Otimização de custos

| Alavanca                                 | Efeito esperado                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compute Savings Plans                    | Até ~50% no Fargate com compromisso de 3 anos; ~20% a 30% com 1 ano e sem pagamento antecipado                                                                                                                                                                           |
| Tasks Graviton (ARM)                     | Fargate ~20% mais barato. A imagem `node:22-alpine` é multiarquitetura, então o Dockerfile funciona como está                                                                                                                                                            |
| RDS Reserved Instances                   | ~30% a 40% nas instâncias de banco com prazo de 1 ano                                                                                                                                                                                                                    |
| Dimensionamento pela capacidade medida   | A Fase 8 mediu 400 req/s em uma réplica, cerca de 8x o pico exigido. Mantenha as tasks pequenas e deixe o auto scaling adicionar réplicas por CPU ou volume de requisições, em vez de provisionar antecipadamente                                                        |
| Escalar não produção a zero à noite      | Mostrado no tier A: ~$35/mês de economia só em computação; agende também a parada e a partida do RDS                                                                                                                                                                     |
| SNS + SQS em vez de um cluster Amazon MQ | ~$625/mês a menos no tier B. Só são necessários novos adapters (arquitetura hexagonal)                                                                                                                                                                                   |
| VPC endpoints em vez de tráfego pelo NAT | Gateway endpoints (S3) são gratuitos; interface endpoints (ECR, Secrets Manager, CloudWatch, SQS) custam ~$7.30 por endpoint por AZ por mês e eliminam a cobrança de processamento de dados do NAT. Valem a pena quando o tráfego do NAT passa de algumas centenas de GB |
| Retenção e níveis de log                 | 7 a 14 dias no CloudWatch para logs de aplicação, depois arquivamento no S3; nível `info` em produção; sem logs de health checks (já é assim)                                                                                                                            |
| Amostragem de traces                     | `parentbased_traceidratio` a 10% ou tail sampling no Collector mantendo todo trace com erro; o armazenamento cai aproximadamente na mesma proporção                                                                                                                      |
| Job de limpeza do outbox                 | Reduz pela metade o crescimento do armazenamento do ledger (veja a [seção 1.3](#13-carga-de-trabalho))                                                                                                                                                                   |
| Cognito em vez de Keycloak               | ~$100/mês de economia para até ~10.000 usuários ativos mensais                                                                                                                                                                                                           |

Com um Compute Savings Plan de 1 ano no Fargate (~25%), reservas de RDS (~35%) e Graviton, o tier B cai para aproximadamente **$500/mês** em us-east-1.

## 7. Resumo

| Tier                                     | us-east-1 (SNS + SQS) | Aproximação sa-east-1 (× 1,4) | us-east-1 (cluster Amazon MQ)                 | Aproximação sa-east-1 (× 1,4) |
| ---------------------------------------- | --------------------- | ----------------------------- | --------------------------------------------- | ----------------------------- |
| A — Desenvolvimento / homologação        | **$181.72**           | **$254.41**                   | — (mq.t3.micro de instância única já incluso) | —                             |
| B — Produção base (alta disponibilidade) | **$605.32**           | **$847.45**                   | $1,230.31                                     | $1,722.43                     |
| C — Produção em crescimento (10x)        | **$1,511.41**         | **$2,115.97**                 | $2,076.73                                     | $2,907.42                     |

A coluna de São Paulo aplica um único fator de 1,4 sobre a conta inteira. É uma aproximação; os preços reais de sa-east-1 variam por serviço.

### Recomendação

- **Comece com o tier B em sa-east-1** (cerca de $850/mês on-demand, cerca de $700/mês com Savings Plans e reservas). Ele mantém os dados financeiros no Brasil, o que simplifica a conformidade com a LGPD.
- **Use SNS + SQS em vez de um cluster Amazon MQ** em produção. O cluster de broker custaria quase o mesmo que o resto da plataforma, para um volume de poucos milhões de mensagens por mês.
- **Mantenha as instâncias de banco pequenas e escale horizontalmente os serviços sem estado.** A capacidade medida mostra que o gargalo está longe. Os principais custos são fixos (bancos Multi-AZ, NAT e observabilidade), não de tráfego.
- **Reavalie Keycloak versus Cognito** quando o número de usuários e a necessidade de customizar o realm forem conhecidos.

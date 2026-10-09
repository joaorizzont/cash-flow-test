# Operação, SLOs e runbooks

Este documento complementa as seções "Observabilidade", "Resiliência" e "Testes de carga e resiliência" do README. Ele define os objetivos de nível de serviço, um runbook para cada alerta, backup e recuperação de desastres, e as práticas de operação do dia a dia.

## Indicadores e objetivos de nível de serviço

| SLO                            | SLI e forma de medir                                                                                                                                                                                                                                         | Meta                                   | Error budget (30 dias)                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------- |
| Disponibilidade do ledger      | Proporção de requisições ao ledger sem `5xx`: `1 - sum(rate(http_server_request_duration_seconds_count{job="cash-flow/ledger",http_response_status_code=~"5.."}[30d])) / sum(rate(http_server_request_duration_seconds_count{job="cash-flow/ledger"}[30d]))` | 99,9%                                  | 0,1% das requisições (~43 min de queda total) |
| Sucesso do consolidado no pico | Proporção de requisições ao relatório sem `5xx` ou `429`, mesma fórmula com `job="cash-flow/daily-balance"` e `http_response_status_code=~"5..\|429"`                                                                                                        | 95% (requisito); 99,5% de meta interna | 0,5% das requisições                          |
| Latência do consolidado        | `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{job="cash-flow/daily-balance"}[5m])))`                                                                                                                               | p95 < 500 ms                           | —                                             |
| Atualidade da consolidação     | `histogram_quantile(0.95, sum by (le) (rate(cashflow_consolidation_lag_seconds_bucket[5m])))`                                                                                                                                                                | p95 < 30 s (medido: 0,5 s)             | —                                             |
| Atualidade do outbox           | `max(cashflow_outbox_lag_seconds)`                                                                                                                                                                                                                           | < 60 s                                 | —                                             |
| Nenhum lançamento perdido      | `rabbitmq_detailed_queue_messages{queue="daily-balance.ledger-events.dlq"}` e o diário de movimentos batendo com o ledger                                                                                                                                    | 0 mensagens na DLQ                     | nenhum                                        |

A meta interna do consolidado é mais rígida que o requisito para que o requisito nunca seja o primeiro limite rompido. Medição local: 0% de falhas a 50 req/s, inclusive com quedas de 30 segundos do Redis e do banco do consolidado.

Alertas baseados em burn rate sobre esses SLOs são uma evolução planejada; hoje os alertas usam limites fixos ([alerts.yml](../infra/prometheus/alerts.yml)).

## Runbooks

Ferramentas gerais:

| Ferramenta                     | Endereço local                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Dashboard Cash Flow no Grafana | http://localhost:3000                                                                       |
| Alertas do Prometheus          | http://localhost:9090/alerts                                                                |
| RabbitMQ Management            | http://localhost:15672                                                                      |
| Traces e logs                  | Grafana → Explore → Tempo (pelo `x-trace-id`) ou Loki                                       |
| Estado dos serviços            | `docker compose ps`, `curl localhost:3001/health/ready`, `curl localhost:3002/health/ready` |

Consulta útil no Loki para erros e avisos: `{service_namespace="cash-flow"} | severity_number >= 13`.

### DailyBalanceRequestLossAboveBudget (crítico)

- **Sintoma:** mais de 5% das requisições ao relatório falham (`5xx` ou `429`) por 2 minutos. Isso rompe o requisito de negócio.
- **Impacto:** os comerciantes não conseguem ver o saldo consolidado. O registro de lançamentos não é afetado.
- **Diagnóstico:**
  1. Linha "API do consolidado" do dashboard: separe por status. `429` indica rate limiting; `503` com código `BALANCE_REPORT_UNAVAILABLE` indica banco fora e nada em cache; `503 AUTHENTICATION_UNAVAILABLE` indica JWKS inacessível; outros `5xx` indicam bug.
  2. Verifique o `/health/ready` do `daily-balance` e o painel de circuit breakers.
  3. Loki: `{service_name="daily-balance"} | severity_number >= 17`.
- **Mitigação:** para `429` causado por carga legítima, aumente `RATE_LIMIT_MAX` ou adicione réplicas; para problemas no banco, veja `CircuitBreakerOpen`; para o Keycloak, restabeleça-o (tokens já emitidos continuam funcionando quando as chaves já estão em cache).
- **Recuperação:** confirme no dashboard que a taxa de sucesso voltou a ficar acima de 99,5%.

### LedgerErrorRateHigh (crítico)

- **Sintoma:** mais de 1% das requisições ao ledger retornam `5xx` por 5 minutos.
- **Impacto:** lançamentos podem deixar de ser registrados; esta é a capacidade mais crítica.
- **Diagnóstico:** `docker compose ps ledger postgres-ledger`; `/health/ready` do ledger; Loki `{service_name="ledger"} | severity_number >= 17`; abra no Tempo o trace de uma requisição com falha usando o `x-trace-id` devolvido ao cliente.
- **Mitigação:** restabeleça o `postgres-ledger` (o ledger depende apenas do próprio banco; RabbitMQ e o consolidado não estão no seu caminho). Faça rollback do último deploy se os erros começaram com ele.
- **Recuperação:** clientes idempotentes podem repetir com segurança usando a mesma `Idempotency-Key`; nenhum lançamento duplicado é criado.

### DailyBalanceLatencyHigh (aviso)

- **Sintoma:** p95 do relatório acima de 500 ms por 5 minutos.
- **Diagnóstico:** painel de taxa de acerto do cache (uma queda nos `hit` empurra carga para o banco); erros de `DATABASE_TIMEOUT_MS` nos logs; spans lentos no Tempo filtrados por `service.name = daily-balance`.
- **Mitigação:** verifique a saúde do Redis; adicione réplicas da API; verifique a carga do banco (relatórios de período longo, até 92 dias, são os mais caros).

### OutboxLagHigh (aviso)

- **Sintoma:** o evento pendente mais antigo tem mais de 60 s.
- **Impacto:** o consolidado para de receber novos lançamentos; o registro não é afetado.
- **Diagnóstico:**
  1. `docker compose ps ledger-outbox-relay rabbitmq`; o `/health/ready` do relay reporta PostgreSQL e RabbitMQ.
  2. Eventos rejeitados: painel "Publicação do relay" (`cashflow_outbox_rejected_total`).
  3. Eventos parados no banco do ledger:
     ```sql
     SELECT event_type, attempts, last_error, next_attempt_at
     FROM outbox WHERE published_at IS NULL ORDER BY occurred_at LIMIT 20;
     ```
     Um `last_error` contendo "has no bound queue" significa que não há fila ligada para aquele tipo de evento (topologia do consumidor ausente).
- **Mitigação:** reinicie o relay ou o broker; se os eventos estiverem sem rota, suba o consumidor do consolidado (ele declara suas filas) — o relay tenta de novo automaticamente com backoff (até 5 minutos entre tentativas).
- **Recuperação:** o número de pendentes volta a 0; não é preciso republicar nada manualmente.

### ConsolidationLagHigh (aviso)

- **Sintoma:** p95 do tempo entre o registro e a consolidação acima de 30 s.
- **Diagnóstico:** o atraso está no outbox (`OutboxLagHigh`) ou na fila (`ConsumerBacklogGrowing`)? Painel de resultados do consumidor: muitos resultados `retry` indicam problema no banco do lado do consolidado.
- **Mitigação:** corrija a causa anterior; escale os consumidores ou aumente `CONSUMER_PREFETCH` se o problema for throughput.

### ConsumerBacklogGrowing (aviso)

- **Sintoma:** mais de 1.000 mensagens prontas em `daily-balance.ledger-events` por 5 minutos.
- **Diagnóstico:** `docker compose ps daily-balance-consumer`; `/health/ready` do consumidor (`ledger-events-consumer` precisa estar `up`); retentativas no painel de resultados do consumidor.
- **Mitigação:** reinicie ou escale o consumidor (`docker compose up -d --scale daily-balance-consumer=3`); os consumidores são idempotentes e seguros para rodar em paralelo.

### DeadLetterQueueNotEmpty (crítico)

- **Sintoma:** mensagens em `daily-balance.ledger-events.dlq`.
- **Impacto:** o consolidado está sem esses lançamentos até que eles sejam devolvidos à fila (redrive).
- **Diagnóstico:** RabbitMQ Management → Queues → `daily-balance.ledger-events.dlq` → Get messages (com "Nack, requeue true"). Leia o header `x-dead-letter-reason`:
  - `Message body is not valid JSON` ou `does not match the ledger event contract`: bug no produtor ou no contrato; não faça o redrive antes de corrigir;
  - `Gave up after N attempts: ...`: problema transitório (normalmente o banco) que durou mais que `CONSUMER_MAX_ATTEMPTS × CONSUMER_RETRY_DELAY_MS`.
- **Mitigação:** corrija a causa primeiro.
- **Recuperação:**
  ```bash
  docker compose exec daily-balance-consumer node dist/redrive-dead-letters.js --limit 1000
  ```
  Devolver um evento que já foi aplicado é seguro (deduplicação por id do evento e do lançamento). Se houver suspeita de que um dia está errado, reconstrua-o a partir do diário:
  ```bash
  docker compose exec daily-balance-consumer node dist/rebuild-day.js --merchant <merchant-id> --date <yyyy-mm-dd>
  ```

### CircuitBreakerOpen (aviso)

- **Sintoma:** `cashflow_circuit_breaker_state == 2` para um circuito (`redis` ou `postgres`) por mais de 1 minuto.
- **Impacto:** `redis` aberto: sem cache, todas as leituras vão ao banco (latência maior, sem fallback de dado obsoleto para relatórios novos). `postgres` aberto: só relatórios em cache são servidos (`STALE`); os demais recebem `503`.
- **Diagnóstico:** saúde da dependência (`docker compose ps redis postgres-daily-balance`); logs `circuit breaker state changed`.
- **Mitigação:** restabeleça a dependência; o circuito fecha sozinho depois de uma chamada de teste bem-sucedida (a cada `CIRCUIT_RESET_TIMEOUT_MS`).

### StaleBalanceReportsServed (aviso)

- **Sintoma:** respostas com `x-cache: STALE`.
- **Impacto:** os comerciantes veem um saldo calculado antes de o banco ficar indisponível (a resposta traz `generatedAt`).
- **Mitigação:** a mesma de `CircuitBreakerOpen` para `postgres`. Quando o banco volta, relatórios atualizados substituem os obsoletos automaticamente.

### ServiceNotReportingTelemetry (crítico)

- **Sintoma:** `cashflow_service_up` ausente para um job.
- **Diagnóstico:** `docker compose ps`; logs do container (`docker compose logs <service> --tail 200`); se o processo estiver rodando, verifique o Collector (`docker compose logs otel-collector`).
- **Mitigação:** reinicie o serviço; verifique limites de recursos e reinícios em loop (a inicialização falha rápido com configuração inválida e com banco inacessível para as migrations).

## Backup e recuperação de desastres

| Armazenamento             | Papel                                    | Meta de RPO                                          | Meta de RTO | Estratégia de backup (produção)                                           | Reconstruível?                                        |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| PostgreSQL do ledger      | Fonte da verdade (lançamentos, outbox)   | ≤ 5 min (PITR, próximo de zero com réplica síncrona) | ≤ 30 min    | Arquivamento contínuo de WAL + snapshots diários, standby Multi-AZ        | Não — é a fonte da verdade                            |
| PostgreSQL do consolidado | Modelo de leitura e diário de movimentos | ≤ 1 h                                                | ≤ 1 h       | Snapshots diários + WAL                                                   | Sim, a partir dos eventos do ledger                   |
| RabbitMQ                  | Transporte                               | n/a                                                  | ≤ 15 min    | Quorum queues replicadas em 3 nós                                         | Sim, eventos não publicados ficam no outbox           |
| Redis                     | Cache                                    | n/a                                                  | minutos     | Não é necessário                                                          | Sim, preenchido sob demanda                           |
| Banco do Keycloak         | Usuários, realm                          | ≤ 1 h                                                | ≤ 1 h       | Snapshots diários; a configuração do realm está versionada no repositório | O realm sim (importação); usuários precisam de backup |

**Reconstruindo o consolidado depois de perder seu banco:**

1. Restaure o snapshot mais recente (ou comece vazio); as migrations rodam na inicialização.
2. Republique os eventos do ledger do período afetado reiniciando o outbox:
   ```sql
   UPDATE outbox SET published_at = NULL, attempts = 0, next_attempt_at = now()
   WHERE occurred_at >= '<start of the period>';
   ```
3. O relay publica os eventos de novo; o consumidor descarta os que já estão no diário restaurado e aplica o restante.
4. Valide uma amostra de dias contra o ledger (soma dos lançamentos por comerciante e data de competência) e rode o `rebuild-day` onde for necessário.

Isso depende de manter as linhas publicadas do outbox por pelo menos o período de retenção dos backups do consolidado (veja manutenção).

**Frequência dos testes de recuperação de desastres:** restaurar o ledger a partir do backup em um ambiente descartável a cada trimestre; executar o procedimento de reconstrução do consolidado a cada semestre; rodar os testes automatizados de resiliência (`npm run test:resilience*`) a cada release.

## Práticas de deploy

- **Deploys sem downtime:** atualizações graduais (rolling updates) condicionadas ao readiness. O readiness da API reporta as dependências; na API do consolidado, as dependências compartilhadas são não críticas (`degraded`), para que as réplicas não sejam removidas todas de uma vez.
- **Migrations:** rodam na inicialização sob um advisory lock do PostgreSQL, então várias réplicas subindo juntas aplicam cada migration uma única vez. As migrations precisam ser retrocompatíveis (expand/contract): primeiro adicionar colunas e tabelas, depois fazer o deploy do código que as usa, e remover estruturas antigas em uma release posterior.
- **Contratos de eventos:** mudanças incompatíveis viram uma nova versão do evento (`v2`), publicada junto com a `v1` até que todos os consumidores migrem.
- **Health checks:** `/health/live` apenas diz que o processo está vivo (usado para reinícios); `/health/ready` verifica as dependências (usado para direcionar tráfego). Relay e consumidor expõem os mesmos endpoints no seu servidor de health.
- **Configuração:** validada na inicialização; um valor inválido interrompe o processo com um erro claro.

### Parâmetros de escala e ajuste

| Variável                     | Processo               | Padrão  | Efeito                                                       |
| ---------------------------- | ---------------------- | ------- | ------------------------------------------------------------ |
| `DATABASE_POOL_SIZE`         | todos                  | 10      | Conexões por réplica                                         |
| `RATE_LIMIT_MAX`             | ledger                 | 1.200   | Requisições por comerciante por janela (por réplica)         |
| `RATE_LIMIT_MAX`             | daily-balance          | 6.000   | Requisições por comerciante por janela (por réplica)         |
| `RATE_LIMIT_WINDOW_MS`       | APIs                   | 60.000  | Janela do rate limit                                         |
| `MAX_BACKDATED_DAYS`         | ledger                 | 30      | Data de competência mais antiga aceita                       |
| `OUTBOX_BATCH_SIZE`          | ledger-outbox-relay    | 100     | Eventos por ciclo (máximo 1.000)                             |
| `OUTBOX_POLL_INTERVAL_MS`    | ledger-outbox-relay    | 500     | Espera entre ciclos quando ocioso                            |
| `OUTBOX_MAX_BACKOFF_MS`      | ledger-outbox-relay    | 30.000  | Espera máxima após falhas de infraestrutura                  |
| `OUTBOX_RETRY_BASE_DELAY_MS` | ledger-outbox-relay    | 1.000   | Atraso da primeira retentativa de um evento rejeitado        |
| `OUTBOX_RETRY_MAX_DELAY_MS`  | ledger-outbox-relay    | 300.000 | Atraso máximo de retentativa de um evento rejeitado          |
| `CONSUMER_PREFETCH`          | daily-balance-consumer | 20      | Mensagens processadas em paralelo por réplica (máximo 1.000) |
| `CONSUMER_MAX_ATTEMPTS`      | daily-balance-consumer | 5       | Tentativas antes da DLQ                                      |
| `CONSUMER_RETRY_DELAY_MS`    | daily-balance-consumer | 10.000  | Espera na fila de retentativa                                |
| `CACHE_FRESH_TTL_MS`         | daily-balance          | 5.000   | Tempo em que o relatório em cache é considerado atual        |
| `CACHE_STALE_TTL_SECONDS`    | daily-balance          | 86.400  | Por quanto tempo o relatório é mantido como reserva          |
| `CACHE_TIMEOUT_MS`           | daily-balance          | 100     | Tempo máximo de uma chamada ao Redis                         |
| `DATABASE_TIMEOUT_MS`        | daily-balance          | 2.000   | Timeout de conexão e de consulta                             |
| `CIRCUIT_FAILURE_THRESHOLD`  | daily-balance          | 5       | Falhas consecutivas que abrem um circuito                    |
| `CIRCUIT_RESET_TIMEOUT_MS`   | daily-balance          | 10.000  | Tempo aberto antes de uma chamada de teste                   |

Para tolerar quedas mais longas do banco sem recorrer à DLQ, aumente `CONSUMER_MAX_ATTEMPTS × CONSUMER_RETRY_DELAY_MS` (janela padrão de cerca de 50 s).

### Referência de capacidade

Medido em um notebook Apple M1 com todos os containers na mesma máquina, uma réplica por processo:

| Carga                                              | Falhas | p95     |
| -------------------------------------------------- | ------ | ------- |
| 50 req/s no consolidado (2 min)                    | 0%     | 6,5 ms  |
| 200 req/s                                          | 0%     | 7,6 ms  |
| 400 req/s                                          | 0%     | 20,9 ms |
| 10 req/s de gravações com o consolidado fora do ar | 0%     | 20 ms   |

Escala horizontal: APIs e consumidores não guardam estado (o estado fica no PostgreSQL, no Redis e no RabbitMQ); o relay escala com `SKIP LOCKED`; o rate limit por réplica precisa ser ajustado ou levado para um armazenamento compartilhado quando réplicas são adicionadas.

## Manutenção

| Item                        | Situação atual                                                             | Plano                                                                                                |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Linhas publicadas do outbox | Mantidas para sempre                                                       | Job periódico apagando linhas publicadas há mais de N dias (N ≥ retenção dos backups do consolidado) |
| Chaves de idempotência      | Mantidas para sempre                                                       | Expirar após 24–72 h (clientes repetem em questão de minutos)                                        |
| Diário de movimentos        | Mantido para sempre                                                        | Arquivar períodos fechados em armazenamento frio                                                     |
| Logs e traces               | Retenção de 7 dias no Prometheus; blocos do Tempo por 24 h; padrão do Loki | Produção: object storage com 30 dias de logs e traces, 13 meses de métricas com downsampling         |

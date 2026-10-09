# ADR-0010: Cache com fallback de dados obsoletos e circuit breakers

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

A API de relatórios precisa sustentar 50 req/s com no máximo 5% de perda. Suas dependências são o próprio banco PostgreSQL e um cache. Qualquer uma delas pode ficar lenta ou cair. Uma dependência lenta é pior do que uma fora do ar: as requisições se acumulam segurando conexões até tudo estourar o timeout. No pico, muitas requisições pedem o mesmo relatório ao mesmo tempo.

## Decisão

O caso de uso do relatório é decorado com uma política de **cache-aside** na camada de aplicação, e os adapters são protegidos por **circuit breakers**:

| Mecanismo                            | Comportamento                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache fresco                         | Os relatórios ficam no Redis; durante `CACHE_FRESH_TTL_MS` (5 s) são servidos como `x-cache: HIT`                                                                                                                                                                   |
| Stale-if-error                       | A mesma entrada fica no Redis por `CACHE_STALE_TTL_SECONDS` (24 h). Se o banco falhar, o último relatório conhecido é devolvido como `x-cache: STALE`, em vez de um erro                                                                                            |
| Indisponível                         | Sem relatório em cache e com o banco fora, a API responde `503` com `Retry-After`                                                                                                                                                                                   |
| Single flight                        | Misses idênticos e simultâneos compartilham uma única leitura no banco, evitando o efeito manada quando uma entrada expira no pico                                                                                                                                  |
| Circuit breakers (Redis, PostgreSQL) | Depois de `CIRCUIT_FAILURE_THRESHOLD` falhas consecutivas o circuito abre e as chamadas falham imediatamente por `CIRCUIT_RESET_TIMEOUT_MS`; depois disso, uma única chamada de teste decide se ele fecha                                                           |
| Timeouts                             | `CACHE_TIMEOUT_MS` (100 ms) por chamada ao Redis; `DATABASE_TIMEOUT_MS` (2 s) para conexão e consulta                                                                                                                                                               |
| Port de cache de melhor esforço      | O adapter de cache nunca lança exceção: uma falha do Redis é tratada como miss, então o Redis nunca é uma dependência obrigatória                                                                                                                                   |
| Readiness                            | PostgreSQL e Redis são reportados como não críticos no `/health/ready` da API (`degraded`, ainda `200`). Todas as réplicas os compartilham, então falhar o readiness tiraria todas as réplicas de uma vez e transformaria uma degradação em indisponibilidade total |
| Tratamento de erros do pool          | Conexões ociosas encerradas pelo PostgreSQL não derrubam mais o processo (encontrado ao testar a queda do banco, agora coberto por um teste de regressão)                                                                                                           |

O cache não é invalidado por eventos: o relatório já é eventualmente consistente, e manter o consumidor independente do Redis compensa uma defasagem extra de no máximo 5 s.

## Alternativas consideradas

| Alternativa                             | Por que não foi escolhida                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apenas cache com TTL curto              | A API falharia junto com o banco                                                                                                                                                 |
| Invalidação a cada evento               | Acopla o consumidor ao Redis e adiciona um modo de falha à consolidação por um ganho pequeno de atualidade                                                                       |
| Cache em memória do processo            | Não é compartilhado entre réplicas; respostas inconsistentes entre elas                                                                                                          |
| Biblioteca de circuit breaker `opossum` | Mais completa (janelas deslizantes, eventos), mas o escopo precisa de cerca de 80 linhas; uma implementação própria com relógio injetável é totalmente determinística nos testes |
| Timeouts sem circuit breakers           | Cada requisição ainda esperaria o timeout durante uma queda                                                                                                                      |
| Lock distribuído contra efeito manada   | Desnecessário neste volume; o single flight por processo é suficiente                                                                                                            |

## Consequências

**Positivas**

- Pico com o Redis fora por 30 s: 0% de falhas, p95 de 22 ms. Pico com o banco fora por 30 s: 0% de falhas, p95 de 8,3 ms, relatórios servidos como `STALE`.
- As respostas informam ao cliente de onde vieram (`x-cache`) e quando foram calculadas (`generatedAt`).

**Negativas / trade-offs**

- Um relatório nunca calculado antes fica indisponível enquanto o banco está fora.
- Dados obsoletos podem ser servidos por até 24 h durante uma queda longa do banco; isso fica visível pelo alerta `StaleBalanceReportsServed`.
- O estado do circuito é por processo, não compartilhado entre réplicas.

## Evidências

- Política de cache: [cached-balance-report.ts](../../services/daily-balance/src/application/services/cached-balance-report.ts)
- Circuit breaker: [circuit-breaker.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaker.ts), [circuit-breaking-read-model.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaking-read-model.ts)
- Adapter do Redis: [redis-balance-report-cache.ts](../../services/daily-balance/src/adapters/outbound/redis/redis-balance-report-cache.ts), [redis-connection.ts](../../services/daily-balance/src/adapters/outbound/redis/redis-connection.ts)
- Readiness: [health-routes.ts](../../services/daily-balance/src/adapters/inbound/http/routes/health-routes.ts), [main.ts](../../services/daily-balance/src/main.ts)
- Testes de carga com quedas: [dependency-outage-under-load.mjs](../../tests/resilience/dependency-outage-under-load.mjs)

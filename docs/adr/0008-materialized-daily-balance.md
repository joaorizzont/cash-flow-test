# ADR-0008: Saldo diário materializado com consumidor idempotente

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O saldo diário precisa atender 50 req/s no pico com no máximo 5% de perda. Calcular o saldo no momento da consulta (somando todos os lançamentos do dia, e de todos os dias anteriores para o saldo acumulado) faria o custo da leitura crescer com o histórico e acoplaria o relatório ao ledger. Os eventos chegam pelo menos uma vez, possivelmente duplicados, fora de ordem e às vezes enquanto o banco está temporariamente indisponível.

## Decisão

Aplicar **CQRS com modelo de leitura materializado**:

- `daily_balances` guarda, por comerciante e data de competência, `total_credits_cents`, `total_debits_cents`, `entry_count` e a coluna gerada `balance_cents`.
- `applied_movements` é um **diário** de todos os eventos consolidados: chave primária `event_id` e `entry_id` único.

Para cada evento, em **uma única transação**, o consumidor:

1. insere o movimento no diário com `ON CONFLICT DO NOTHING`; se nada foi inserido, o evento é duplicado e o processamento para;
2. caso contrário, aplica um **UPSERT aditivo** (`INSERT ... ON CONFLICT DO UPDATE SET total = total + delta`), que é atômico mesmo com vários consumidores atualizando o mesmo dia;
3. confirma a mensagem (`ack`) somente depois do commit.

A deduplicação por `entry_id`, além de `event_id`, protege contra o mesmo lançamento chegando com dois ids de evento, por exemplo `v1` e `v2` publicados em paralelo durante uma migração de contrato.

Um estorno chega como movimento do tipo oposto, então o saldo do dia é corrigido e os totais continuam mostrando o que realmente movimentou, como em um extrato bancário.

**Tratamento de falhas** no consumidor:

| Situação                                       | Tratamento                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Não é JSON ou quebra o contrato                | Direto para a DLQ com `x-dead-letter-reason`; repetir não ajudaria                                  |
| Rejeitado pelo domínio                         | Mesmo tratamento: DLQ imediata                                                                      |
| Falha transitória (banco fora do ar)           | Republicado na fila de espera com `x-attempt + 1`, volta depois de `CONSUMER_RETRY_DELAY_MS` (10 s) |
| Tentativas esgotadas (`CONSUMER_MAX_ATTEMPTS`) | DLQ com o último erro                                                                               |

A republicação na fila de espera ou na DLQ usa publisher confirms, e a mensagem original só recebe `ack` depois da confirmação, então nenhuma mensagem se perde no caminho. As filas são **quorum queues** ([ADR-0006](0006-rabbitmq-message-broker.md)).

**Operação**: `rebuild-day` recalcula um dia a partir do diário. Ele primeiro trava a linha do dia e só depois lê o diário, então é seguro executá-lo com o consumidor ativo (um teste de integração roda cinco reconstruções concorrentes com 60 consolidações e confere o saldo final contra o diário). `redrive-dead-letters` devolve as mensagens da DLQ para a fila principal depois que a causa é corrigida.

## Alternativas consideradas

| Alternativa                                     | Por que não foi escolhida                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Calcular o saldo na consulta a partir do ledger | Acoplamento síncrono ao ledger e custo de consulta crescendo com o histórico                                   |
| Ler, modificar e gravar o saldo                 | Atualizações perdidas sob concorrência, a menos que toda atualização trave a linha                             |
| Deduplicar com um cache separado (set no Redis) | Não é atômico com a atualização do saldo; uma queda entre as duas operações quebra o efeito exatamente-uma-vez |
| Reconstruir a partir da API do ledger           | Acoplamento em tempo de execução com o ledger; o diário local é suficiente                                     |
| `nack` com reenfileiramento imediato            | Laço quente enquanto o banco está fora; a retentativa com atraso por uma fila com TTL evita isso               |
| Circuit breaker no processo pausando o consumo  | Mais complexo; a retentativa com atraso já absorve quedas curtas                                               |

## Consequências

**Positivas**

- As leituras são buscas por chave primária e varreduras de intervalo, o que torna o pico trivial (50 req/s com p95 de 6,5 ms; 400 req/s sem erros com uma única réplica).
- Efeito exatamente-uma-vez no saldo apesar da entrega pelo menos uma vez (testado com três entregas paralelas do mesmo evento).
- O modelo de leitura pode ser reconstruído por dia sem o ledger.

**Negativas / trade-offs**

- Consistência eventual entre o registro e o relatório (p95 medido de 0,5 s).
- Uma queda do banco do consolidado maior que cerca de 50 s (5 tentativas × 10 s) envia mensagens para a DLQ; nada se perde, mas é preciso fazer o redrive. O alerta `DeadLetterQueueNotEmpty` torna isso visível; tentativas e atraso são configuráveis.
- O diário cresce a cada lançamento; arquivar períodos antigos é uma evolução futura.

## Evidências

- Caso de uso: [consolidate-movement-service.ts](../../services/daily-balance/src/application/use-cases/consolidate-movement-service.ts)
- Diário e UPSERT aditivo: [postgres-movement-journal.ts](../../services/daily-balance/src/adapters/outbound/postgres/postgres-movement-journal.ts), [postgres-daily-balance-repository.ts](../../services/daily-balance/src/adapters/outbound/postgres/postgres-daily-balance-repository.ts)
- Decisão do resultado e regras da DLQ: [ledger-message-handler.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-message-handler.ts)
- Publicação na fila de espera e na DLQ: [rabbitmq-ledger-event-consumer.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-ledger-event-consumer.ts)
- Reconstrução e redrive: [rebuild-daily-balance-service.ts](../../services/daily-balance/src/application/use-cases/rebuild-daily-balance-service.ts), [rabbitmq-dead-letter-redriver.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-dead-letter-redriver.ts)
- Agregado de domínio: [daily-balance.ts](../../services/daily-balance/src/domain/balance/daily-balance.ts)

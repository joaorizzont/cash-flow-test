# ADR-0005: Transactional Outbox com relay por polling

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Todo lançamento registrado ou estornado precisa gerar um evento para o consolidado. Gravar o lançamento no banco e depois publicar no broker é um dual write: se o processo cair entre as duas operações, ou o evento se perde (saldo errado para sempre) ou é publicado um evento de um lançamento que sofreu rollback. Publicar dentro da requisição HTTP também colocaria o broker no caminho crítico do registro, violando o requisito de que o registro continue funcionando quando outras partes falham.

## Decisão

Usar o padrão **Transactional Outbox**:

1. O ledger grava o lançamento e o seu evento (um CloudEvent, [ADR-0007](0007-cloudevents-shared-contracts.md)) na tabela `outbox`, **na mesma transação**. A API nunca fala com o broker.
2. Um processo separado, `ledger-outbox-relay` (mesma imagem, outro comando), roda um worker de polling que:
   - seleciona até `OUTBOX_BATCH_SIZE` eventos pendentes cujo `next_attempt_at` já passou, com `FOR UPDATE SKIP LOCKED`;
   - publica os eventos em paralelo no RabbitMQ com **publisher confirms**, mensagens `persistent` e a flag **`mandatory`**;
   - marca como publicados os eventos confirmados; eventos devolvidos pelo broker (sem fila ligada) são rejeitados individualmente e reagendados com **backoff exponencial por mensagem** (`attempts`, `last_error`, `next_attempt_at`, de 1 s até 5 min);
   - se a falha for de infraestrutura (banco ou broker indisponível), o lote inteiro sofre rollback e o worker aplica backoff (até 30 s).
3. Ritmo: roda de novo imediatamente quando o lote publicou algo, e após `OUTBOX_POLL_INTERVAL_MS` (500 ms) quando está ocioso.

A entrega é **at-least-once**; o `id` do CloudEvent (também enviado como `messageId` do AMQP) permite que os consumidores descartem duplicatas.

## Alternativas consideradas

| Alternativa                                   | Por que não foi escolhida                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Publicar direto na requisição                 | Dual write, e o broker vira dependência do registro                                                                                   |
| Publicar depois do commit, em melhor esforço  | Perde eventos se o processo cair entre o commit e a publicação                                                                        |
| Relay como tarefa em background dentro da API | Compartilha recursos e ciclo de vida com a API; escala e falhas ficam acopladas                                                       |
| CDC com Debezium lendo o WAL                  | Latência de milissegundos e sem polling, mas acrescenta Kafka Connect ou Debezium Server para operar. Registrado como evolução futura |
| `LISTEN/NOTIFY` para acordar o relay          | Menor latência, mas exige uma conexão dedicada e o polling continuaria necessário como rede de segurança. Evolução futura             |
| Alternate exchange para eventos sem rota      | Estacionaria as mensagens em outra fila, exigindo reprocessamento manual; mantê-las no outbox com backoff é mais simples              |

## Consequências

**Positivas**

- Nenhum evento é perdido: verificado gravando 900 lançamentos com todo o lado do consolidado fora do ar e conferindo que os 900 foram consolidados com o total exato.
- Quedas do RabbitMQ não afetam o registro; os eventos se acumulam no outbox e são publicados quando o broker volta (o relay reconecta automaticamente).
- Um evento problemático nunca bloqueia os demais (o head-of-line blocking foi encontrado durante o desenvolvimento e corrigido com o backoff por mensagem).
- Escala horizontal do relay sem duplicatas: um teste de integração roda três relays em paralelo sobre 40 eventos, e cada um é publicado exatamente uma vez.

**Negativas / trade-offs**

- Até cerca de 500 ms de latência extra quando ocioso (atraso de consolidação medido: p50 de 0,26 s, p95 de 0,5 s), irrelevante para um relatório diário.
- Uma consulta a cada 500 ms quando ocioso; barata porque um índice parcial contém apenas as linhas pendentes.
- O outbox cresce; um job de limpeza das linhas publicadas é uma pendência de manutenção.
- Duplicatas são possíveis (queda entre a publicação e a marcação), então todo consumidor precisa ser idempotente.

## Evidências

- Gravação no outbox na mesma transação: [postgres-entry-repository.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-entry-repository.ts), [outbox-writer.ts](../../services/ledger/src/adapters/outbound/postgres/outbox-writer.ts)
- Lock e registro de falhas: [postgres-outbox-store.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-outbox-store.ts)
- Lógica do lote e isolamento de rejeições: [publish-pending-events-service.ts](../../services/ledger/src/application/use-cases/publish-pending-events-service.ts), [retry-backoff.ts](../../services/ledger/src/application/services/retry-backoff.ts)
- Confirms e `mandatory`: [rabbitmq-event-publisher.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-event-publisher.ts), [unroutable-event-error.ts](../../services/ledger/src/adapters/outbound/messaging/unroutable-event-error.ts)
- Ritmo e backoff do worker: [polling-worker.ts](../../services/ledger/src/adapters/inbound/scheduler/polling-worker.ts)
- Colunas de retentativa: [0004-add-outbox-retry-columns.ts](../../services/ledger/src/adapters/outbound/postgres/migrations/0004-add-outbox-retry-columns.ts)

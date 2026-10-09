# ADR-0006: RabbitMQ como message broker

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Os eventos do ledger precisam chegar ao consolidado de forma durável, sobreviver a reinícios do broker, permitir retentativas sem bloquear outras mensagens e estacionar mensagens problemáticas (poison messages) para inspeção. O volume esperado é de dezenas de eventos por segundo. A solução precisa rodar localmente com um único comando.

## Decisão

Usar **RabbitMQ 4** com a seguinte topologia:

| Elemento                            | Tipo                    | Finalidade                                                              |
| ----------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `cash-flow.ledger.events`           | Topic exchange, durável | Publicado pelo ledger; a routing key é o tipo do evento                 |
| `daily-balance.ledger-events`       | Quorum queue            | Ligada com `cashflow.ledger.entry.*.v1`; consumida pelo consolidado     |
| `daily-balance.ledger-events.retry` | Quorum queue            | Retentativa com atraso: TTL por mensagem, devolve para a fila principal |
| `daily-balance.dead-letter`         | Direct exchange         | Recebe as mensagens que não serão mais retentadas                       |
| `daily-balance.ledger-events.dlq`   | Quorum queue            | Dead letter queue, com o motivo no header `x-dead-letter-reason`        |

O lado consumidor é dono das suas filas (o produtor só conhece o exchange), então novos consumidores podem assinar os eventos sem mudar o ledger. Cliente: `amqplib` 2.x com recuperação automática de conexão, confirm channels e prefetch.

## Alternativas consideradas

| Alternativa             | Por que não foi escolhida                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Apache Kafka            | Forte para alto throughput e replay, mas o volume não justifica seu custo operacional; retentativa e DLQ precisariam ser construídas por cima |
| AWS SNS + SQS           | A opção gerenciada equivalente em produção; não roda localmente sem emuladores. Os adapters hexagonais permitem trocar sem impacto no núcleo  |
| Redis Streams           | Mais leve, mas com garantias de durabilidade mais fracas e menos recursos de roteamento                                                       |
| Classic mirrored queues | Descontinuadas em favor das quorum queues, que replicam com Raft e são recomendadas para segurança dos dados                                  |

## Consequências

**Positivas**

- Durabilidade, roteamento, dead-lettering e TTL por mensagem nativos cobrem retentativas e DLQ sem infraestrutura própria.
- A interface de gerenciamento e um plugin do Prometheus expõem a profundidade das filas (usada pelos alertas `ConsumerBacklogGrowing` e `DeadLetterQueueNotEmpty`).
- Fácil de rodar localmente (um container).

**Negativas / trade-offs**

- Não há replay de longo prazo como no Kafka; a recuperação dos consumidores depende do outbox (os eventos podem ser republicados, veja [operação](../07-operations.md#backup-e-recuperação-de-desastres)).
- Os argumentos de uma fila não podem ser alterados depois da declaração sem recriá-la; por isso o atraso da retentativa é definido por mensagem (`expiration`) e não como argumento da fila.
- A ordem das mensagens não é garantida entre retentativas; isso não é necessário, porque as atualizações do saldo são somas comutativas.

## Alvo em produção

O RabbitMQ é o broker do ambiente local e dos testes. Em produção, a [arquitetura alvo](../03-target-architecture.md#mensageria-amazon-mq-para-rabbitmq-ou-sns--sqs) recomenda **SNS + SQS**: com alguns milhões de mensagens por mês, um cluster Multi-AZ do Amazon MQ custaria quase o mesmo que todo o restante da plataforma ([estimativa de custos](../05-cost-estimate.md)). Graças à arquitetura hexagonal ([ADR-0003](0003-hexagonal-architecture.md)), a mudança se limita a um novo adapter de publicação para o port `EventPublisher` e a um novo adapter consumidor que chama o mesmo `LedgerMessageHandler`; a fila de retentativa e a DLQ passam a ser visibility timeout, `maxReceiveCount` e redrive policy. O Amazon MQ para RabbitMQ continua sendo a opção sem mudança de código para uma primeira entrega mais rápida.

## Evidências

- Topologia do consumidor: [consumer-topology.ts](../../services/daily-balance/src/adapters/outbound/messaging/consumer-topology.ts)
- Consumidor com retentativa e DLQ: [rabbitmq-ledger-event-consumer.ts](../../services/daily-balance/src/adapters/inbound/messaging/rabbitmq-ledger-event-consumer.ts)
- Recuperação de conexão: [rabbitmq-connection.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-connection.ts)
- Coleta das métricas das filas: [prometheus.yml](../../infra/prometheus/prometheus.yml)

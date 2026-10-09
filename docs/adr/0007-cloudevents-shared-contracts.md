# ADR-0007: CloudEvents e pacote de contratos compartilhado

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O ledger e o consolidado são desenvolvidos e implantados de forma independente, mas precisam concordar sobre o formato dos eventos trocados entre eles. Um contrato que diverge em silêncio produz saldos errados; um contrato que acopla os serviços por código de negócio compartilhado anula o motivo de separá-los.

## Decisão

- Os eventos usam o envelope **CloudEvents 1.0** (`specversion`, `id`, `source`, `type`, `subject`, `time`, `datacontenttype`, `data`), publicados como `application/cloudevents+json`.
- A **versão faz parte do tipo**: `cashflow.ledger.entry.recorded.v1` e `cashflow.ledger.entry.reversed.v1`. Uma mudança incompatível vira `v2`, publicada junto com a `v1` durante a transição.
- Os schemas ficam em um **pacote compartilhado, `@cash-flow/contracts`** (uma "published language", no vocabulário do DDD), escritos com TypeBox: uma única definição fornece o tipo TypeScript, o JSON Schema e um validador compilado. O pacote contém apenas schemas e validação, nunca lógica de negócio.
- O consumidor valida toda mensagem contra o contrato antes de processá-la; mensagens inválidas vão direto para a DLQ.
- Os atributos opcionais `traceparent` e `tracestate`, da extensão **Distributed Tracing** do CloudEvents, levam o contexto do trace através do outbox ([ADR-0012](0012-opentelemetry-grafana-stack.md)).

## Alternativas consideradas

| Alternativa                           | Por que não foi escolhida                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Envelope próprio                      | Cada campo de metadado precisaria ser documentado; o CloudEvents é entendido por ferramentas e por outros times |
| Schema registry (Confluent, Apicurio) | Melhor com muitos times e serviços; custo excessivo para dois serviços. Registrado como evolução futura         |
| Duplicar o schema em cada serviço     | A divergência só seria descoberta em produção                                                                   |
| Avro ou Protobuf                      | Payloads menores, mas menos legíveis e com mais ferramental do que o volume exige                               |

## Consequências

**Positivas**

- Uma mudança de contrato aparece como erro de compilação e teste falhando nos dois serviços, no mesmo repositório.
- A evolução do contrato é explícita (`v1` / `v2`), e os adapters hexagonais mantêm a mudança localizada ([ADR-0003](0003-hexagonal-architecture.md)).

**Negativas / trade-offs**

- O pacote é uma dependência de build dos dois serviços; em repositórios separados, ele seria versionado e publicado em um registry.
- A export condition `"source"` acrescenta um pouco de configuração de build, para que testes e desenvolvimento usem os fontes TypeScript e a imagem use o código compilado.

## Evidências

- Envelope e atributos de tracing: [cloud-event.ts](../../packages/contracts/src/cloud-event.ts)
- Schemas e validadores dos eventos do ledger: [ledger-events.ts](../../packages/contracts/src/ledger/ledger-events.ts)
- Mapeamento no produtor: [ledger-event-mapper.ts](../../services/ledger/src/adapters/outbound/messaging/ledger-event-mapper.ts)
- Validação no consumidor: [ledger-message-handler.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-message-handler.ts)

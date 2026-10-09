# ADR-0012: OpenTelemetry com Prometheus, Tempo, Loki e Grafana

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Uma requisição que registra um lançamento atravessa três processos de forma assíncrona (API, relay, consumidor), com um outbox no meio. Quando um saldo parece errado ou atrasado, a operação precisa seguir um lançamento de ponta a ponta, ver quanto tempo ele esperou em cada etapa e correlacionar os logs. Também são necessárias métricas e alertas ligados aos requisitos não funcionais (perda de 5% no pico, disponibilidade do ledger, atraso da consolidação).

## Decisão

- Instrumentar todos os processos com **OpenTelemetry** (traces, métricas e logs), carregado antes da aplicação com `node --import ./dist/telemetry.js`. A instrumentação automática cobre HTTP, Fastify (nomes das rotas), PostgreSQL, RabbitMQ, Redis e pino. A telemetria só é iniciada quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definida, então testes e execuções locais sem a stack não são afetados.
- Exportar **OTLP para um OpenTelemetry Collector**, que envia os traces ao **Tempo**, as métricas ao **Prometheus** (exporter lido pelo Prometheus, além das métricas de fila do RabbitMQ) e os logs ao **Loki** (OTLP nativo). O **Grafana** é provisionado com as três fontes de dados, links de log → trace e trace → logs, um dashboard e as regras de alerta do Prometheus.
- **O contexto do trace atravessa o outbox dentro do evento**: o ledger grava `traceparent`/`tracestate` no CloudEvent (extensão Distributed Tracing); o relay publica dentro desse contexto; o consumidor continua o mesmo trace. Um único trace mostra a requisição HTTP, a inserção no outbox, a publicação e as gravações do consumidor no banco.
- **Correlação**: toda resposta carrega `x-trace-id`; toda linha de log tem `trace_id` e `span_id`.
- **Métricas de negócio e do pipeline nos adapters** (o domínio não depende de OpenTelemetry): lançamentos registrados, pendências e idade no outbox, eventos publicados e rejeitados, resultados do consumidor, histograma do atraso da consolidação, hit/miss/stale do cache, estado dos circuit breakers e um heartbeat `cashflow.service.up` por processo.
- **Controle de ruído**: sem spans para health checks e documentação; spans de banco apenas dentro de um span pai, para que o polling do relay a cada 500 ms não gere traces vazios.

## Alternativas consideradas

| Alternativa                                | Por que não foi escolhida                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDKs de fornecedor (Datadog, New Relic)    | Prendem o código a um fornecedor; com OpenTelemetry, trocar o backend é configuração do Collector                                                        |
| Elastic Stack                              | Mais pesado para rodar localmente                                                                                                                        |
| Header próprio de correlation id           | Não se integra às ferramentas de tracing; o W3C Trace Context é o padrão                                                                                 |
| Coletar os arquivos de log dos containers  | Exige acesso ao diretório de logs do Docker; a exportação de logs por OTLP já carrega os trace ids                                                       |
| `target_info` para alertas de serviço fora | Não é exportada pelo exporter Prometheus do Collector nesta configuração; uma métrica explícita de heartbeat é confiável (descoberto ao testar o alerta) |

## Consequências

**Positivas**

- Visibilidade de ponta a ponta do fluxo assíncrono; o intervalo entre o commit no ledger e o span de publicação mostra o tempo passado no outbox.
- Atraso da consolidação medido: p50 de 0,26 s e p95 de 0,5 s; os alertas foram exercitados localmente (dead letter e serviço fora do ar).
- Os backends podem ser trocados sem mexer nos serviços.

**Negativas / trade-offs**

- Seis containers a mais no ambiente local (Collector, Prometheus, Tempo, Loki, Grafana e k6 sob demanda).
- Amostragem de 100% dos traces no ambiente local; produção precisa de amostragem por proporção ou tail sampling.
- O `x-trace-id` não pode ser verificado pelo `inject` do Fastify (o contexto assíncrono não é propagado), então a lógica do header é testada com uma fonte de trace id injetada e validada na stack em execução.

## Evidências

- Bootstrap: [telemetry.ts](../../services/ledger/src/telemetry.ts)
- Contexto do trace nos eventos: [trace-context.ts](../../services/ledger/src/adapters/outbound/telemetry/trace-context.ts), [cloud-event.ts](../../packages/contracts/src/cloud-event.ts)
- Métricas: [outbox-metrics.ts](../../services/ledger/src/adapters/inbound/scheduler/outbox-metrics.ts), [consumer-metrics.ts](../../services/daily-balance/src/adapters/inbound/messaging/consumer-metrics.ts), [circuit-breaker-metrics.ts](../../services/daily-balance/src/adapters/outbound/resilience/circuit-breaker-metrics.ts)
- Infraestrutura: [otel-collector/config.yaml](../../infra/otel-collector/config.yaml), [alerts.yml](../../infra/prometheus/alerts.yml), [dashboard cash-flow.json](../../infra/grafana/dashboards/cash-flow.json)

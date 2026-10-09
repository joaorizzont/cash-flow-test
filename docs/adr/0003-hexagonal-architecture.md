# ADR-0003: Arquitetura hexagonal em cada serviço

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Em um sistema de microsserviços, as partes com maior chance de mudar são as bordas: o contrato dos eventos trocados entre os dois serviços (novos campos, uma `v2` de um evento, outro envelope), o broker (o RabbitMQ pode virar SQS ou Kafka), a API HTTP consumida por outros sistemas e, com menos frequência, o banco de dados. Já as regras de negócio de lançamentos e saldos diários são estáveis. Uma estrutura em que a lógica de negócio importa diretamente framework, driver ou formato de mensagem transformaria cada mudança de contrato em uma mudança do núcleo.

## Decisão

Os dois serviços seguem **Ports and Adapters (arquitetura hexagonal)**, com as dependências sempre apontando para dentro:

```
src/
├─ domain/        entidades, value objects, eventos e erros de domínio (sem I/O, sem frameworks)
├─ application/   casos de uso, ports de entrada (o que o mundo externo chama) e de saída (o que os casos de uso precisam)
├─ adapters/
│  ├─ inbound/    rotas HTTP, consumidor de mensagens, worker de polling
│  └─ outbound/   PostgreSQL, RabbitMQ, Redis, telemetria, relógio do sistema
├─ config/        validação do ambiente
└─ container.ts   composition root que conecta os adapters aos casos de uso
```

Regras:

- o domínio não importa nada de fora do domínio;
- os casos de uso dependem apenas de interfaces (ports);
- a tradução entre o modelo interno e um contrato externo fica em exatamente um adapter (por exemplo, o mapper de eventos no ledger e o translator de eventos no consolidado, que funciona como camada anticorrupção);
- os adapters concretos são escolhidos apenas no composition root.

O DDD tático complementa a abordagem: value objects (`Money`, `BusinessDate`, `TimeZone`, identificadores) tornam estados inválidos irrepresentáveis, e o agregado `Entry` concentra as regras de estorno e emite os eventos de domínio.

## Alternativas consideradas

| Alternativa                         | Por que não foi escolhida                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Arquitetura em camadas (estilo MVC) | A lógica de negócio tende a depender da camada de persistência e dos tipos do framework; mais difícil de testar sem infraestrutura |
| Centrada no framework (NestJS)      | Acopla a estrutura aos módulos e decorators do framework; mais pesada do que o escopo exige                                        |
| Clean Architecture completa         | Mesmo princípio, com mais camadas e cerimônia (presenters, anéis separados de entidades e casos de uso) para pouco ganho aqui      |

## Consequências

**Positivas**

| Mudança                                    | O que muda                                                               | O que não muda                                |
| ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------- |
| Novo campo ou `v2` de um evento            | Pacote de contratos e o mapper/translator                                | Domínio, casos de uso                         |
| Publicar `v1` e `v2` durante uma transição | Apenas o mapper                                                          | Domínio, casos de uso e o outro serviço       |
| RabbitMQ substituído por SQS ou Kafka      | Um novo adapter que implementa o port de publicação e um novo consumidor | Domínio, casos de uso, outbox e contratos     |
| Nova versão ou protocolo HTTP              | Adapter de entrada                                                       | Domínio e casos de uso                        |
| Troca do banco de dados                    | Adapters de repositório                                                  | Domínio, casos de uso e seus testes unitários |

- O núcleo é testado com fakes em memória e sem infraestrutura (mais de 290 testes unitários nos dois serviços rodam em cerca de um segundo); os adapters têm testes de integração próprios contra containers reais de PostgreSQL, RabbitMQ, Redis e Keycloak.
- Preocupações transversais ficaram fora do núcleo: a autenticação está no adapter HTTP e os casos de uso recebem apenas um `merchantId`; as métricas ficam nos adapters e o domínio não depende de OpenTelemetry.

**Negativas / trade-offs**

- Mais interfaces e arquivos do que um desenho simples em camadas. Aceito porque mudanças de contrato são frequentes em sistemas distribuídos e o custo de cada mudança continua pequeno.
- Alguma duplicação entre os serviços (adapters de infraestrutura como a conexão com o PostgreSQL, o migrator e a conexão com o RabbitMQ existem nos dois). É deliberado: apenas os contratos de eventos são compartilhados, para que cada serviço evolua sua infraestrutura sem releases coordenados.

## Evidências

- Ports do ledger: [application/ports](../../services/ledger/src/application/ports/outbound/entry-repository.ts), composition root [container.ts](../../services/ledger/src/container.ts)
- Mapeamento de eventos em um único adapter: [ledger-event-mapper.ts](../../services/ledger/src/adapters/outbound/messaging/ledger-event-mapper.ts)
- Camada anticorrupção no lado consumidor: [ledger-event-translator.ts](../../services/daily-balance/src/adapters/inbound/messaging/ledger-event-translator.ts)
- Port de publicação com adapter substituível: [event-publisher.ts](../../services/ledger/src/application/ports/outbound/event-publisher.ts), [rabbitmq-event-publisher.ts](../../services/ledger/src/adapters/outbound/messaging/rabbitmq-event-publisher.ts)
- Agregado de domínio: [entry.ts](../../services/ledger/src/domain/entry/entry.ts)

# ADR-0002: Microsserviços orientados a eventos

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O negócio precisa de duas capacidades: registrar os lançamentos de caixa (créditos e débitos) e informar o saldo diário consolidado. O requisito não funcional mais forte é que **o serviço de registro de lançamentos continue disponível quando o serviço de consolidado diário estiver fora do ar**. O consolidado precisa suportar **50 requisições por segundo no pico, com no máximo 5% de perda**.

As duas capacidades têm perfis muito diferentes:

| Aspecto                  | Ledger (registro)                           | Consolidado (relatório)             |
| ------------------------ | ------------------------------------------- | ----------------------------------- |
| Natureza                 | Escrita intensa, fonte da verdade           | Leitura intensa, dado derivado      |
| Consistência             | Forte (dinheiro, idempotência)              | Eventual é aceitável                |
| Tolerância a falhas      | Não pode falhar por causa do outro contexto | Pode ficar alguns segundos atrasado |
| O que determina a escala | Quantidade de vendas                        | Consultas de relatório no pico      |

## Decisão

Dividir o sistema em **dois serviços alinhados aos dois bounded contexts** (`ledger` e `daily-balance`), cada um com seu próprio processo, banco de dados e deploy. Eles se comunicam **apenas por eventos assíncronos** publicados pelo ledger em um message broker. Não existe chamada síncrona entre eles em nenhuma direção.

Cada serviço roda em mais de um processo a partir da mesma imagem, para isolar trabalhos com perfis diferentes:

| Processo                 | Responsabilidade                                          |
| ------------------------ | --------------------------------------------------------- |
| `ledger`                 | API HTTP para registrar, estornar e consultar lançamentos |
| `ledger-outbox-relay`    | Publica no broker os eventos do outbox                    |
| `daily-balance`          | API HTTP para os relatórios diário e por período          |
| `daily-balance-consumer` | Consome os eventos do ledger e atualiza o saldo diário    |

A divisão para em dois serviços: uma decomposição mais fina (por exemplo, um serviço separado de pontos de venda) adicionaria custo operacional sem um requisito que a justificasse.

## Alternativas consideradas

| Alternativa              | Por que não foi escolhida                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monólito                 | Um bug, vazamento de memória ou pico de tráfego no relatório derrubaria também o registro, violando o requisito principal                                                                        |
| Monólito modular         | Oferece fronteiras de domínio limpas, mas os módulos compartilham processo, pool de conexões e deploy, então não garante o isolamento de falhas. Seria a escolha se esse requisito não existisse |
| Microsserviços síncronos | Se o ledger chamasse o consolidado (ou o contrário) por HTTP, a indisponibilidade de um se propagaria para o outro                                                                               |
| Funções serverless       | Atende à carga, mas dificulta rodar a solução inteira localmente (requisito do desafio), aumenta a dependência do provedor e sofre com cold start no pico                                        |
| Muitos serviços pequenos | Mais partes móveis, saltos de rede e custo operacional, sem requisito que os justifique                                                                                                          |

## Consequências

**Positivas**

- Isolamento de falhas real: verificado por um teste automatizado que derruba todo o lado do consolidado (API, consumidor e banco) enquanto lançamentos são gravados a 10 req/s; o ledger teve zero falhas e todos os lançamentos foram consolidados após a recuperação.
- Cada lado escala de forma independente; o lado de leitura pode ganhar réplicas para o pico sem mexer no ledger.
- Novos consumidores (por exemplo, analytics ou notificações) podem assinar os eventos do ledger sem alterar o produtor.

**Negativas / trade-offs**

- O consolidado é eventualmente consistente (p95 medido de 0,5 s entre o registro e a consolidação).
- A mensageria traz entrega at-least-once, o que exige consumidores idempotentes ([ADR-0008](0008-materialized-daily-balance.md)) e uma forma confiável de publicar ([ADR-0005](0005-transactional-outbox-with-polling-relay.md)).
- Mais infraestrutura para operar (broker, dois bancos); mitigado com Docker Compose, health checks e observabilidade desde o início ([ADR-0012](0012-opentelemetry-grafana-stack.md)).

## Evidências

- Composição dos processos: [docker-compose.yml](../../docker-compose.yml)
- Pontos de entrada do ledger: [main.ts](../../services/ledger/src/main.ts), [relay.ts](../../services/ledger/src/relay.ts)
- Pontos de entrada do consolidado: [main.ts](../../services/daily-balance/src/main.ts), [consumer.ts](../../services/daily-balance/src/consumer.ts)
- Teste de resiliência: [consolidated-outage.mjs](../../tests/resilience/consolidated-outage.mjs)

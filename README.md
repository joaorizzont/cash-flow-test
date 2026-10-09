# Cash Flow — Controle de Fluxo de Caixa

Solução para o controle diário de fluxo de caixa de um comerciante: registro de lançamentos (débitos e créditos) e relatório de saldo diário consolidado.

A arquitetura é composta por **dois serviços independentes que se comunicam apenas por eventos**. O serviço de lançamentos continua disponível mesmo quando o serviço de consolidado está fora do ar, e o consolidado responde a partir de um modelo de leitura pré-calculado, suportando picos de 50 requisições por segundo.

> Projeto em construção, desenvolvido em fases. Cada fase corresponde a um ou mais commits. Veja o [roteiro](#roteiro-de-desenvolvimento).

## Visão geral

```mermaid
flowchart LR
  C(["Comerciante"]) -->|HTTPS| L["ledger<br/>registro de lançamentos"]
  C -->|HTTPS| D["daily-balance<br/>saldo consolidado"]
  L --> LDB[("PostgreSQL<br/>ledger + outbox")]
  L -. eventos .-> B{{"RabbitMQ"}}
  B -. eventos .-> D
  D --> DDB[("PostgreSQL<br/>daily_balance")]
  D --> R[("Redis")]
```

| Serviço         | Responsabilidade                                                            | Porta local |
| --------------- | --------------------------------------------------------------------------- | ----------- |
| `ledger`        | Registrar, estornar e consultar lançamentos. Publica eventos via outbox.    | `3001`      |
| `daily-balance` | Consumir eventos, manter o saldo diário materializado e servir o relatório. | `3002`      |

## Justificativa das decisões de arquitetura e tecnologia

### Tipo de arquitetura

**Escolha: microsserviços orientados a eventos, com dois serviços.**

O requisito não funcional mais forte do desafio é que _o serviço de lançamentos não fique indisponível se o consolidado cair_. Isso exige isolamento de falha real: processos, bancos e deploys separados, sem chamada síncrona entre eles. A divisão foi feita apenas onde o requisito exige, em dois serviços alinhados aos dois bounded contexts do domínio, e não em vários serviços pequenos.

| Alternativa         | Por que não foi escolhida                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monólito            | Um erro, vazamento de memória ou pico no relatório derrubaria também o registro de lançamentos                                                                                         |
| Monólito modular    | Resolve bem a separação de domínio, mas compartilha processo, pool de conexões e deploy; continua sem garantir o isolamento de falha exigido. Seria a escolha se não houvesse esse RNF |
| Serverless (Lambda) | Atende à carga, mas dificulta a execução local exigida no desafio, aumenta o acoplamento ao provedor e sofre com cold start em picos                                                   |
| Microsserviços      | **Escolhida.** Isolamento de falha e escala independente; o custo operacional extra é compensado por Docker Compose, health checks e observabilidade desde o início                    |

### Padrões arquiteturais

| Padrão                                     | Problema que resolve                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comunicação assíncrona por eventos         | O ledger não conhece nem espera o consolidado. Se o consolidado cair, os eventos ficam na fila e são processados quando ele voltar                                                                                               |
| Transactional Outbox                       | Evita a escrita dupla (banco + broker). O lançamento e o evento são gravados na mesma transação; um relay publica depois. Nem o RabbitMQ fica no caminho crítico do registro                                                     |
| CQRS com modelo de leitura materializado   | O saldo diário é atualizado a cada evento, não calculado na consulta. A leitura vira uma busca por chave primária com cache, o que torna 50 req/s trivial e mantém a perda de requisições bem abaixo dos 5% tolerados            |
| Consumidor idempotente                     | A entrega é _at-least-once_. A deduplicação por `event_id` na mesma transação da atualização garante que um evento repetido não altere o saldo duas vezes                                                                        |
| Arquitetura hexagonal (Ports and Adapters) | Regras de negócio isoladas de framework, banco e mensageria. Casos de uso dependem apenas de interfaces (ports), o que permite testar o domínio sem infraestrutura e trocar adapters (ex.: RabbitMQ por SQS) sem tocar no núcleo |
| DDD tático                                 | Value objects garantem que nenhum dado inválido exista no domínio (`Money`, `BusinessDate`, `TimeZone`); o agregado `Entry` concentra as regras de estorno e emite os eventos de domínio                                         |

### Tecnologias

| Tecnologia                    | Por que                                                                                                                                                                           | Alternativas consideradas                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Node.js 22 LTS                | I/O não bloqueante adequado a APIs e consumidores de fila; versão LTS com suporte de longo prazo                                                                                  | .NET e Java teriam o mesmo desenho; a escolha seguiu o domínio da linguagem                            |
| TypeScript (modo estrito)     | Tipagem estática para modelar o domínio com segurança e refatorar com confiança                                                                                                   | JavaScript puro, descartado por perder garantias em tempo de compilação                                |
| Fastify                       | Alto desempenho, validação de entrada por JSON Schema, logger estruturado (pino) nativo e testes sem abrir porta (`inject`)                                                       | Express (mais lento e sem validação nativa), NestJS (mais opinativo e pesado para o escopo)            |
| Zod                           | Valida variáveis de ambiente na inicialização: o serviço falha rápido se estiver mal configurado                                                                                  | Leitura manual de `process.env`                                                                        |
| PostgreSQL 17, um por serviço | ACID para o ledger; `CHECK` constraints; `FOR UPDATE SKIP LOCKED` para o outbox com várias instâncias; UPSERT aditivo para o consolidado; bancos separados preservam o isolamento | MongoDB (sem a mesma garantia transacional simples para outbox + entidade)                             |
| RabbitMQ 4                    | Filas duráveis, DLQ nativa, simples de operar localmente. Na AWS, a mesma abstração é atendida por SNS + SQS                                                                      | Kafka, descartado porque o volume (dezenas de eventos por segundo) não justifica seu custo operacional |
| Redis 7                       | Cache de leitura do consolidado, reduzindo latência e carga no banco nos picos                                                                                                    | Cache em memória do processo, que não é compartilhado entre réplicas                                   |
| Vitest                        | Rápido, suporte nativo a ESM e TypeScript, cobertura com V8                                                                                                                       | Jest, que exige configuração adicional para ESM                                                        |
| ESLint + Prettier             | Padronização automática e regras que reforçam Clean Code: complexidade ciclomática máxima de 8, no máximo 3 parâmetros por função, proibição de comentários inline                | -                                                                                                      |
| Docker + Docker Compose       | Um único `Dockerfile` multi-stage para os dois serviços; imagem final só com dependências de produção e usuário não-root; ambiente local completo com um comando                  | -                                                                                                      |

### Decisões de domínio

| Decisão                                                   | Justificativa                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valores em centavos (inteiro)                             | Ponto flutuante não representa valores monetários com exatidão (`0.1 + 0.2 !== 0.3`). Inteiros em centavos eliminam erros de arredondamento                                                                                                         |
| Lançamentos imutáveis, correção por estorno               | Preserva a trilha de auditoria e permite reconstruir o consolidado a qualquer momento a partir do ledger. O estorno usa a mesma data de competência do original para corrigir o saldo do dia correto                                                |
| Data de competência separada do instante de registro      | O dia do caixa (`businessDate`) nem sempre coincide com o momento do registro (`recordedAt`): há lançamentos retroativos e diferenças de fuso. O consolidado agrupa pelo dia do caixa                                                               |
| Fuso horário por ponto de venda                           | O Brasil tem quatro fusos. Com um fuso único, uma venda à 00h30 em Fernando de Noronha (23h30 em Brasília) seria rejeitada como data futura. Cada ponto de venda tem seu fuso local; lançamentos sem ponto de venda usam o fuso padrão configurável |
| Fusos no padrão IANA, não deslocamentos                   | `America/Manaus` carrega o histórico e as regras de horário de verão; `-04:00` não. Se o horário de verão voltar, basta atualizar a base de fusos do runtime, sem alterar código                                                                    |
| Instante em UTC + fuso gravado, sem hora local armazenada | A hora local é derivada do instante e do fuso, então armazená-la seria redundante e poderia divergir. Gravar o fuso vigente em cada lançamento garante que mudar a configuração do ponto de venda não reinterprete lançamentos passados             |
| O consolidado não lida com fusos                          | O evento carrega apenas a data de competência já resolvida. Toda a lógica de fuso fica no ledger, que é onde o lançamento nasce                                                                                                                     |
| Identificadores UUID                                      | Gerados pela aplicação antes de persistir, o que permite montar o agregado e seus eventos sem depender do banco; não expõem volume de negócio como IDs sequenciais                                                                                  |

## Arquitetura hexagonal (Ports and Adapters)

Cada serviço segue a mesma organização. As dependências apontam sempre para dentro: o domínio não conhece frameworks, banco ou mensageria.

```
services/<service>/
├─ src/
│  ├─ domain/                 # entidades, value objects e regras de negócio puras
│  ├─ application/
│  │  ├─ use-cases/           # orquestração dos casos de uso
│  │  └─ ports/
│  │     ├─ inbound/          # contratos que o mundo externo usa para acionar a aplicação
│  │     └─ outbound/         # contratos que a aplicação usa (repositórios, publisher, cache)
│  ├─ adapters/
│  │  ├─ inbound/             # HTTP (Fastify), consumidores de fila
│  │  └─ outbound/            # PostgreSQL, RabbitMQ, Redis
│  ├─ config/                 # leitura e validação de ambiente
│  └─ main.ts                 # composition root: instancia adapters e injeta nos casos de uso
└─ test/                      # espelha a estrutura de src/
```

## Como executar

### Pré-requisitos

- Docker e Docker Compose v2
- Node.js 22 (apenas para desenvolvimento e testes fora do Docker)

### Subindo tudo com Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Verificando os serviços:

```bash
curl http://localhost:3001/health/live
curl http://localhost:3002/health/ready
```

| Recurso                  | Endereço                                                      |
| ------------------------ | ------------------------------------------------------------- |
| ledger                   | http://localhost:3001                                         |
| daily-balance            | http://localhost:3002                                         |
| RabbitMQ Management      | http://localhost:15672 (usuário/senha: `cashflow`/`cashflow`) |
| PostgreSQL ledger        | `localhost:5432`                                              |
| PostgreSQL daily-balance | `localhost:5433`                                              |
| Redis                    | `localhost:6379`                                              |

Para parar e remover os volumes:

```bash
docker compose down -v
```

> **Rede corporativa ou VPN:** se o `npm ci` falhar dentro do build com `Exit handler never called!` ou `Connection reset by peer`, o Docker não está conseguindo acessar o registro do npm. É possível informar um mirror apenas para o build: `NPM_REGISTRY=https://registry.npmmirror.com/ docker compose up -d --build`.

### Desenvolvimento local

```bash
npm install
docker compose up -d postgres-ledger postgres-daily-balance rabbitmq redis
npm run dev -w services/ledger
npm run dev -w services/daily-balance
```

### Comandos

| Comando             | Descrição                              |
| ------------------- | -------------------------------------- |
| `npm test`          | Executa os testes de todos os serviços |
| `npm run lint`      | Análise estática                       |
| `npm run typecheck` | Verificação de tipos                   |
| `npm run format`    | Formata o código com Prettier          |
| `npm run build`     | Compila os serviços para `dist/`       |

## Regras de negócio do ledger

| Regra               | Descrição                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valor               | Inteiro positivo em centavos (`amountInCents`), evitando erros de arredondamento de ponto flutuante                                                                                                                                                                                                                       |
| Moeda               | Apenas `BRL`                                                                                                                                                                                                                                                                                                              |
| Tipo                | `CREDIT` ou `DEBIT`                                                                                                                                                                                                                                                                                                       |
| Data de competência | Formato `YYYY-MM-DD`, é o dia do caixa no fuso do ponto de venda; não pode ser futura nem anterior a 30 dias. Se não for informada, assume o dia atual no fuso do ponto de venda                                                                                                                                          |
| Ponto de venda      | Configurado com seu fuso local (nome IANA, ex.: `America/Manaus`). Lançamentos sem ponto de venda usam o fuso padrão (`DEFAULT_TIME_ZONE`, por padrão `America/Sao_Paulo`)                                                                                                                                                |
| Data e hora         | O instante do registro é gravado em UTC (`recordedAt`) junto com o fuso vigente no momento (`timeZone`). A hora local (`recordedAtLocal`) é derivada na resposta e não é armazenada, evitando redundância; o fuso gravado garante que mudanças futuras na configuração do ponto de venda não alterem lançamentos passados |
| Descrição           | Obrigatória, de 1 a 140 caracteres                                                                                                                                                                                                                                                                                        |
| Imutabilidade       | Lançamentos nunca são alterados ou excluídos; correções são feitas por estorno                                                                                                                                                                                                                                            |
| Estorno             | Gera um lançamento de tipo oposto, mesmo valor, mesma data de competência, mesmo ponto de venda e mesmo fuso, referenciando o original; um lançamento só pode ser estornado uma vez e um estorno não pode ser estornado                                                                                                   |
| Isolamento          | Um comerciante só acessa os próprios lançamentos                                                                                                                                                                                                                                                                          |
| Consulta            | Por período de até 92 dias, paginada (máximo de 100 itens por página)                                                                                                                                                                                                                                                     |

Cada lançamento registrado gera um evento de domínio (`EntryRecorded` ou `EntryReversed`), que será persistido no outbox e publicado para o serviço de consolidado.

## Roteiro de desenvolvimento

| Fase | Entrega                                                                                                                                                                              | Status       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 0    | **Fundação**: monorepo com workspaces, TypeScript, lint, testes, Dockerfile multi-stage, Docker Compose com a infraestrutura, health checks, README                                  | ✅ Concluída |
| 1    | **Domínio do ledger**: entidade de lançamento, value objects (dinheiro em centavos, tipo, data de competência), estorno, casos de uso e ports, testes unitários                      | ✅ Concluída |
| 2    | **Adapters do ledger**: API HTTP, repositório PostgreSQL, migrations, idempotência (`Idempotency-Key`), tabela de outbox na mesma transação, testes de integração com Testcontainers | ⏳ Próxima   |
| 3    | **Publicação de eventos**: contrato versionado dos eventos, outbox relay com `FOR UPDATE SKIP LOCKED`, publisher RabbitMQ, exchange e filas com DLQ                                  | Pendente     |
| 4    | **Consolidação diária**: domínio do saldo diário, consumidor idempotente por `event_id`, UPSERT aditivo, retentativas e DLQ, reprocessamento de um dia                               | Pendente     |
| 5    | **API do consolidado**: consulta por dia e por período, saldo acumulado, cache Redis com fallback para o banco e circuit breaker                                                     | Pendente     |
| 6    | **Segurança**: Keycloak (OIDC), validação de JWT, escopos, `merchant_id` vindo do token, rate limiting, headers de segurança                                                         | Pendente     |
| 7    | **Observabilidade**: OpenTelemetry (traces, métricas, logs), correlation id ponta a ponta, Prometheus, Grafana, Tempo e Loki, dashboards e alertas                                   | Pendente     |
| 8    | **Resiliência e carga**: teste que derruba o consolidado e prova que o ledger continua respondendo; k6 com 50 req/s e limite de 5% de falhas                                         | Pendente     |
| 9    | **Documentação**: domínios e capacidades, requisitos, arquitetura alvo e de transição, ADRs, segurança, observabilidade e estimativa de custos em `docs/`                            | Pendente     |
| 10   | **CI/CD**: GitHub Actions com lint, testes, cobertura, CodeQL e Trivy; Terraform opcional para AWS                                                                                   | Pendente     |

## Convenções

- Código, nomes, mensagens de commit e documentação técnica em inglês; o README em português.
- Código sem comentários: nomes expressivos, funções pequenas e responsabilidade única tornam a intenção explícita. As decisões ficam registradas na seção de justificativas e nos ADRs.
- Princípios SOLID e Clean Code, reforçados por regras de lint (complexidade ciclomática, número máximo de parâmetros, imports de tipo).
- Commits seguindo [Conventional Commits](https://www.conventionalcommits.org/).

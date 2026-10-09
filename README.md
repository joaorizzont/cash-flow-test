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

| Tecnologia                                 | Por que                                                                                                                                                                                                                | Alternativas consideradas                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Node.js 22 LTS                             | I/O não bloqueante adequado a APIs e consumidores de fila; versão LTS com suporte de longo prazo                                                                                                                       | .NET e Java teriam o mesmo desenho; a escolha seguiu o domínio da linguagem                                     |
| TypeScript (modo estrito)                  | Tipagem estática para modelar o domínio com segurança e refatorar com confiança                                                                                                                                        | JavaScript puro, descartado por perder garantias em tempo de compilação                                         |
| Fastify                                    | Alto desempenho, validação de entrada por JSON Schema, logger estruturado (pino) nativo e testes sem abrir porta (`inject`)                                                                                            | Express (mais lento e sem validação nativa), NestJS (mais opinativo e pesado para o escopo)                     |
| Zod                                        | Valida variáveis de ambiente na inicialização: o serviço falha rápido se estiver mal configurado                                                                                                                       | Leitura manual de `process.env`                                                                                 |
| PostgreSQL 17, um por serviço              | ACID para o ledger; `CHECK` constraints; `FOR UPDATE SKIP LOCKED` para o outbox com várias instâncias; UPSERT aditivo para o consolidado; bancos separados preservam o isolamento                                      | MongoDB, DynamoDB (ver seção seguinte)                                                                          |
| RabbitMQ 4                                 | Filas duráveis, DLQ nativa, simples de operar localmente. Na AWS, a mesma abstração é atendida por SNS + SQS                                                                                                           | Kafka, descartado porque o volume (dezenas de eventos por segundo) não justifica seu custo operacional          |
| Redis 7                                    | Cache de leitura do consolidado, reduzindo latência e carga no banco nos picos                                                                                                                                         | Cache em memória do processo, que não é compartilhado entre réplicas                                            |
| node-postgres (`pg`) com SQL explícito     | Controle total sobre `FOR UPDATE SKIP LOCKED`, `ON CONFLICT` e transações; as consultas ficam visíveis e revisáveis                                                                                                    | ORMs como Prisma ou TypeORM, que escondem justamente as construções de concorrência das quais a solução depende |
| Migrations versionadas no código           | Executadas na inicialização com `pg_advisory_lock`, então várias réplicas subindo juntas não aplicam a mesma migration duas vezes; por serem módulos TypeScript, vão compiladas na imagem sem cópia de arquivos extras | Ferramentas externas de migration, que adicionariam mais um passo ao deploy                                     |
| TypeBox + `@fastify/type-provider-typebox` | Um único schema valida a requisição, tipa o handler em TypeScript e gera a documentação OpenAPI, sem duplicar contratos                                                                                                | Zod nas rotas, que exigiria conversão adicional para JSON Schema                                                |
| Swagger UI (`@fastify/swagger`)            | Documentação navegável e sempre sincronizada com o código em `/docs`                                                                                                                                                   | Documentação manual, que diverge do código com o tempo                                                          |
| UUID v7                                    | Identificadores ordenados no tempo: mantêm as inserções no índice B-tree próximas, ao contrário do UUID v4 aleatório                                                                                                   | UUID v4, IDs sequenciais do banco                                                                               |
| Testcontainers                             | Testes de integração contra um PostgreSQL real e descartável, cobrindo constraints, transações e concorrência que um mock não reproduz                                                                                 | Banco em memória (SQLite, pg-mem), com comportamento diferente do PostgreSQL                                    |
| Vitest                                     | Rápido, suporte nativo a ESM e TypeScript, cobertura com V8                                                                                                                                                            | Jest, que exige configuração adicional para ESM                                                                 |
| ESLint + Prettier                          | Padronização automática e regras que reforçam Clean Code: complexidade ciclomática máxima de 8, no máximo 3 parâmetros por função, proibição de comentários inline                                                     | -                                                                                                               |
| Docker + Docker Compose                    | Um único `Dockerfile` multi-stage para os dois serviços; imagem final só com dependências de produção e usuário não-root; ambiente local completo com um comando                                                       | -                                                                                                               |

### Banco de dados: por que relacional (PostgreSQL) e não NoSQL

O domínio é financeiro e transacional. Quase todas as garantias de que a solução depende são nativas do PostgreSQL; em um banco não relacional, várias delas precisariam ser reconstruídas na aplicação.

| Necessidade da solução                                                   | Como o PostgreSQL atende                                                                                                                                                      | Custo em um banco NoSQL                                                                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gravar o lançamento e seu evento de forma atômica (Transactional Outbox) | Transação ACID comum (`BEGIN`/`COMMIT`) envolvendo as tabelas `entries` e `outbox`                                                                                            | MongoDB exige replica set para transações multi-documento, com custo de desempenho; DynamoDB limita a quantidade de itens por transação e costuma usar Streams, um desenho diferente |
| Regras financeiras válidas mesmo sob concorrência                        | Constraints declarativas: `CHECK` (valor positivo), índice único parcial (um único estorno por lançamento) e chave estrangeira composta (ponto de venda do mesmo comerciante) | Sem chaves estrangeiras nem constraints equivalentes: cada regra vira código com locks ou escritas condicionais na aplicação                                                         |
| Idempotência sem condição de corrida                                     | `INSERT ... ON CONFLICT DO NOTHING`: a segunda requisição com a mesma chave espera a primeira terminar e lê a resposta gravada                                                | Escritas condicionais e tratamento manual de requisições simultâneas                                                                                                                 |
| Vários relays lendo o outbox sem processar o mesmo evento (Fase 3)       | `SELECT ... FOR UPDATE SKIP LOCKED`                                                                                                                                           | Mecanismo de lease ou lock distribuído implementado à parte                                                                                                                          |
| Atualização do saldo diário sem perda por concorrência (Fase 4)          | UPSERT aditivo: `ON CONFLICT DO UPDATE SET total = total + EXCLUDED.total`                                                                                                    | Possível com incrementos atômicos, mas sem a deduplicação do evento na mesma transação                                                                                               |
| Saldo acumulado por período (Fase 5)                                     | Funções de janela (`SUM(...) OVER (ORDER BY data)`)                                                                                                                           | Agregação na aplicação ou pipelines específicos                                                                                                                                      |
| Dados de estrutura fixa                                                  | Schema rígido funciona como proteção: um dado fora do padrão não entra                                                                                                        | A flexibilidade de schema, principal vantagem de um banco de documentos, não traz ganho para lançamentos financeiros                                                                 |
| Volume do desafio                                                        | 50 req/s de leitura por chave, com cache, está muito abaixo da capacidade de uma única instância                                                                              | A escala horizontal massiva não resolve nenhum gargalo real deste cenário e custaria as garantias acima                                                                              |

**Onde um banco não relacional faz sentido nesta arquitetura:**

- **Cache do consolidado:** o Redis, que é não relacional, já é usado onde é forte: leitura por chave com baixa latência.
- **Modelo de leitura em escala muito maior:** com milhões de comerciantes consultando o saldo continuamente, o saldo diário (sempre consultado por comerciante e data) poderia migrar para um banco chave-valor como DynamoDB ou Cassandra. Como ele é derivado do ledger por eventos e cada serviço tem o próprio banco, essa troca afetaria apenas o serviço de consolidado.
- **Histórico e análise:** lançamentos antigos poderiam ser exportados para armazenamento colunar ou data lake (por exemplo, Parquet no S3) para relatórios analíticos.

### Decisões de domínio

| Decisão                                                   | Justificativa                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valores em centavos (inteiro)                             | Ponto flutuante não representa valores monetários com exatidão (`0.1 + 0.2 !== 0.3`). Inteiros em centavos eliminam erros de arredondamento                                                                                                                            |
| Lançamentos imutáveis, correção por estorno               | Preserva a trilha de auditoria e permite reconstruir o consolidado a qualquer momento a partir do ledger. O estorno usa a mesma data de competência do original para corrigir o saldo do dia correto                                                                   |
| Data de competência separada do instante de registro      | O dia do caixa (`businessDate`) nem sempre coincide com o momento do registro (`recordedAt`): há lançamentos retroativos e diferenças de fuso. O consolidado agrupa pelo dia do caixa                                                                                  |
| Fuso horário por ponto de venda                           | O Brasil tem quatro fusos. Com um fuso único, uma venda à 00h30 em Fernando de Noronha (23h30 em Brasília) seria rejeitada como data futura. Cada ponto de venda tem seu fuso local; lançamentos sem ponto de venda usam o fuso padrão configurável                    |
| Fusos no padrão IANA, não deslocamentos                   | `America/Manaus` carrega o histórico e as regras de horário de verão; `-04:00` não. Se o horário de verão voltar, basta atualizar a base de fusos do runtime, sem alterar código                                                                                       |
| Instante em UTC + fuso gravado, sem hora local armazenada | A hora local é derivada do instante e do fuso, então armazená-la seria redundante e poderia divergir. Gravar o fuso vigente em cada lançamento garante que mudar a configuração do ponto de venda não reinterprete lançamentos passados                                |
| O consolidado não lida com fusos                          | O evento carrega apenas a data de competência já resolvida. Toda a lógica de fuso fica no ledger, que é onde o lançamento nasce                                                                                                                                        |
| Idempotência por `Idempotency-Key`                        | Em rede instável o cliente não sabe se o lançamento foi gravado e repete a requisição. A chave, a resposta e o lançamento são gravados na mesma transação: uma retentativa devolve a resposta original e nunca duplica o lançamento, mesmo com requisições simultâneas |
| Erros no padrão Problem Details (RFC 9457)                | Formato padronizado (`application/problem+json`) com um `code` estável que o cliente pode tratar; erros internos nunca expõem detalhes de implementação                                                                                                                |
| Regras críticas também no banco                           | Constraints garantem as invariantes mesmo sob concorrência: valor positivo, um único estorno por lançamento (índice único) e ponto de venda pertencente ao mesmo comerciante (chave estrangeira composta)                                                              |
| Identificadores UUID                                      | Gerados pela aplicação antes de persistir, o que permite montar o agregado e seus eventos sem depender do banco; não expõem volume de negócio como IDs sequenciais                                                                                                     |

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
cp services/ledger/.env.example services/ledger/.env
docker compose up -d postgres-ledger postgres-daily-balance rabbitmq redis
npm run dev -w services/ledger
npm run dev -w services/daily-balance
```

As migrations do banco são aplicadas automaticamente na inicialização do serviço.

### Testes

| Tipo       | Comando                                    | O que cobre                                                                                                      |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Unidade    | `npm test`                                 | Domínio, casos de uso e rotas HTTP com adapters em memória; não exige infraestrutura                             |
| Integração | `npm run test:integration`                 | Repositórios, outbox, migrations, idempotência e API contra um PostgreSQL real via Testcontainers (exige Docker) |
| Cobertura  | `npm run test:coverage -w services/ledger` | Relatório de cobertura dos testes de unidade                                                                     |

Os testes de integração verificam inclusive cenários de concorrência: duas requisições simultâneas com a mesma chave de idempotência gravam um único lançamento, e dois estornos simultâneos do mesmo lançamento resultam em um sucesso e um conflito.

### Comandos

| Comando                    | Descrição                                      |
| -------------------------- | ---------------------------------------------- |
| `npm test`                 | Executa os testes de unidade                   |
| `npm run test:integration` | Executa os testes de integração (exige Docker) |
| `npm run lint`             | Análise estática                               |
| `npm run typecheck`        | Verificação de tipos                           |
| `npm run format`           | Formata o código com Prettier                  |
| `npm run build`            | Compila os serviços para `dist/`               |

## API do ledger

A documentação interativa (OpenAPI) fica em **http://localhost:3001/docs**.

Até a fase de segurança, o comerciante é identificado pelo header `x-merchant-id` (UUID). Na Fase 6 ele passa a ser extraído do token JWT.

| Método | Rota                                    | Descrição                                                |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| `PUT`  | `/v1/points-of-sale/{pointOfSaleId}`    | Cria ou atualiza um ponto de venda com seu fuso local    |
| `POST` | `/v1/entries`                           | Registra um crédito ou débito (aceita `Idempotency-Key`) |
| `POST` | `/v1/entries/{entryId}/reversal`        | Estorna um lançamento (aceita `Idempotency-Key`)         |
| `GET`  | `/v1/entries/{entryId}`                 | Consulta um lançamento                                   |
| `GET`  | `/v1/entries?from=&to=&page=&pageSize=` | Lista lançamentos por período de data de competência     |
| `GET`  | `/health/live` e `/health/ready`        | Liveness e readiness (o readiness verifica o PostgreSQL) |

### Exemplos

```bash
MERCHANT=6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f
POS=3e4d5c6b-7a89-4b0c-9d1e-2f3a4b5c6d7e

curl -X PUT http://localhost:3001/v1/points-of-sale/$POS \
  -H "content-type: application/json" -H "x-merchant-id: $MERCHANT" \
  -d '{"timeZone":"America/Manaus"}'

curl -X POST http://localhost:3001/v1/entries \
  -H "content-type: application/json" -H "x-merchant-id: $MERCHANT" \
  -H "idempotency-key: venda-1024" \
  -d "{\"type\":\"CREDIT\",\"amountInCents\":15990,\"description\":\"Venda 1024\",\"pointOfSaleId\":\"$POS\"}"

curl "http://localhost:3001/v1/entries?from=2026-10-01&to=2026-10-31" -H "x-merchant-id: $MERCHANT"
```

Resposta de um lançamento (`201 Created`, com header `Location`):

```json
{
  "id": "01a12170-5d59-70fd-b181-3c8a5960d348",
  "merchantId": "6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f",
  "pointOfSaleId": "3e4d5c6b-7a89-4b0c-9d1e-2f3a4b5c6d7e",
  "type": "CREDIT",
  "amountInCents": 15990,
  "currency": "BRL",
  "businessDate": "2026-10-09",
  "description": "Venda 1024",
  "reversalOf": null,
  "recordedAt": "2026-10-09T16:12:54.487Z",
  "recordedAtLocal": "2026-10-09T12:12:54-04:00",
  "timeZone": "America/Manaus"
}
```

### Idempotência

Envie um `Idempotency-Key` único por operação. Ao repetir a mesma requisição com a mesma chave, a API devolve a resposta original com o header `idempotent-replayed: true` e não grava um novo lançamento. Reutilizar a chave com um corpo diferente resulta em `422 IDEMPOTENCY_KEY_REUSED`. Se a operação falhar, a chave é liberada e a requisição pode ser repetida.

### Erros

Todas as respostas de erro seguem o padrão [Problem Details (RFC 9457)](https://www.rfc-editor.org/rfc/rfc9457):

```json
{
  "type": "about:blank",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Business date 2030-01-01 must be between today and 30 days ago",
  "code": "BUSINESS_DATE_OUT_OF_RANGE"
}
```

| Status | `code`                       | Quando                                                         |
| ------ | ---------------------------- | -------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`           | Corpo, parâmetros ou headers inválidos                         |
| 404    | `ENTRY_NOT_FOUND`            | Lançamento inexistente ou de outro comerciante                 |
| 404    | `ROUTE_NOT_FOUND`            | Rota inexistente                                               |
| 409    | `ENTRY_ALREADY_REVERSED`     | O lançamento já foi estornado                                  |
| 422    | `BUSINESS_DATE_OUT_OF_RANGE` | Data de competência futura ou além da janela de retroatividade |
| 422    | `REVERSAL_OF_REVERSAL`       | Tentativa de estornar um estorno                               |
| 422    | `POINT_OF_SALE_NOT_FOUND`    | Ponto de venda não configurado para o comerciante              |
| 422    | `IDEMPOTENCY_KEY_REUSED`     | Chave de idempotência reutilizada com outra requisição         |
| 500    | `INTERNAL_ERROR`             | Erro inesperado (detalhes apenas no log)                       |

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
| 2    | **Adapters do ledger**: API HTTP, repositório PostgreSQL, migrations, idempotência (`Idempotency-Key`), tabela de outbox na mesma transação, testes de integração com Testcontainers | ✅ Concluída |
| 3    | **Publicação de eventos**: contrato versionado dos eventos, outbox relay com `FOR UPDATE SKIP LOCKED`, publisher RabbitMQ, exchange e filas com DLQ                                  | ⏳ Próxima   |
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

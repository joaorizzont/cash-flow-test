# ADR-0013: Node.js, TypeScript e Fastify

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O desafio permite qualquer linguagem. Os serviços são limitados por I/O (HTTP, banco, broker, cache), com processamento simples. O código precisa ser fortemente tipado para modelar dinheiro e datas com segurança, fácil de testar sem infraestrutura e rápido para subir em containers.

## Decisão

| Escolha                         | Motivo                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js 22 LTS                  | I/O não bloqueante adequado a APIs e consumidores de fila; suporte de longo prazo                                       |
| TypeScript em modo estrito, ESM | Tipos estáticos para a modelagem do domínio (`noUncheckedIndexedAccess`, checagem estrita de nulos)                     |
| Fastify 5                       | Alto throughput, validação por JSON Schema, log com pino embutido, `inject` para testes sem abrir porta                 |
| TypeBox + type provider         | Um único schema valida a requisição, tipa o handler e gera o OpenAPI (`/docs`)                                          |
| Zod para configuração           | O processo falha rápido na inicialização quando está mal configurado                                                    |
| `pg` com SQL explícito          | Veja a [ADR-0004](0004-postgresql-database-per-service.md)                                                              |
| UUID v7                         | Identificadores ordenados no tempo mantêm as inserções no B-tree localizadas; gerados pela aplicação antes de persistir |
| Vitest, Testcontainers, k6      | Testes de unidade rápidos, testes de integração contra dependências reais, testes de carga contra o ambiente completo   |
| ESLint (strict) + Prettier      | Regras que reforçam Clean Code: complexidade máxima 8, no máximo 3 parâmetros, sem comentários inline                   |
| Monorepo com npm workspaces     | Dois serviços e o pacote de contratos em um repositório, construídos por um único Dockerfile multi-stage                |

O código não tem comentários: a intenção é expressa por nomes, funções pequenas e por estas ADRs.

## Alternativas consideradas

| Alternativa         | Por que não foi escolhida                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Java / Spring, .NET | Suportariam o mesmo desenho; a escolha seguiu o domínio da linguagem e a velocidade de iteração |
| Go                  | Excelente para esta carga; menos expressivo para modelagem rica de domínio com value objects    |
| Express             | Mais lento e sem validação nativa por schema                                                    |
| NestJS              | Sistema de módulos e decorators opinativo; mais pesado do que o escopo exige                    |
| Jest                | Exige configuração adicional para ESM nativo                                                    |

## Consequências

**Positivas**

- Uma única linguagem nos dois serviços, no pacote de contratos, nos testes e nas ferramentas de carga e resiliência.
- O desempenho medido está muito acima do requisito (400 req/s em uma réplica sem erros).

**Negativas / trade-offs**

- Node.js é single-threaded por processo; trabalho pesado de CPU exigiria worker threads ou escala horizontal (não é o caso aqui).
- ESM com TypeScript exige cuidado com a resolução de módulos (`NodeNext`, sufixo `.js` nos imports, uma export condition própria para o pacote de contratos).

## Evidências

- Configuração base: [tsconfig.base.json](../../tsconfig.base.json), [eslint.config.js](../../eslint.config.js)
- Servidor com rotas orientadas a schema: [server.ts](../../services/ledger/src/adapters/inbound/http/server.ts), [entry-schemas.ts](../../services/ledger/src/adapters/inbound/http/schemas/entry-schemas.ts)
- Validação de configuração: [env.ts](../../services/ledger/src/config/env.ts)
- Imagem: [Dockerfile](../../Dockerfile)

# ADR-0004: PostgreSQL, um banco por serviço

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O ledger guarda dinheiro e é a fonte da verdade. Ele precisa de escritas atômicas em várias tabelas (lançamento, evento do outbox, chave de idempotência), de restrições que valham sob concorrência (valores positivos, um único estorno por lançamento, ponto de venda pertencente ao mesmo comerciante) e de um padrão de leitura em fila para o outbox com várias instâncias do relay. O consolidado precisa de atualizações atômicas do tipo "somar ao total atual" vindas de consumidores concorrentes, de deduplicação de eventos e de leituras pequenas por intervalo de comerciante e data. Os volumes são modestos (dezenas de eventos por segundo) e os padrões de acesso são bem conhecidos.

## Decisão

Usar **PostgreSQL 17** nos dois serviços, com **um banco por serviço** (`ledger` e `daily_balance`), nunca compartilhado. O acesso é feito com `node-postgres` e SQL explícito, transações propagadas com `AsyncLocalStorage` e migrations escritas como módulos TypeScript, aplicadas na inicialização sob um advisory lock do PostgreSQL.

As regras críticas são garantidas pelo banco, além do domínio:

| Regra                                       | Mecanismo                                                    |
| ------------------------------------------- | ------------------------------------------------------------ |
| Valor positivo                              | Constraint `CHECK`                                           |
| Um lançamento é estornado no máximo uma vez | Índice único parcial em `reversal_of`                        |
| Ponto de venda pertence ao comerciante      | Chave estrangeira composta `(merchant_id, point_of_sale_id)` |
| Idempotência                                | Chave gravada de forma atômica com a resposta e o lançamento |
| Evento processado uma única vez             | Chave primária em `event_id` e `entry_id` único no diário    |
| Saldo sempre igual aos totais               | Coluna gerada `balance_cents`                                |

## Alternativas consideradas

| Necessidade                                  | PostgreSQL                                                         | Opção NoSQL e sua limitação                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lançamento e evento gravados juntos (outbox) | `BEGIN`/`COMMIT` comum sobre duas tabelas                          | O MongoDB exige replica set para transações multidocumento; o DynamoDB limita os itens por transação e empurra para o uso de Streams |
| Invariantes sob concorrência                 | Constraints `CHECK`, únicas e de chave estrangeira                 | Normalmente garantidas só no código da aplicação, que sofre com condições de corrida                                                 |
| Vários relays lendo o outbox                 | `FOR UPDATE SKIP LOCKED`                                           | Exige um lease ou lock distribuído implementado à parte                                                                              |
| Atualizações aditivas do saldo               | `INSERT ... ON CONFLICT DO UPDATE SET total = total + x`           | `$inc` / `ADD` existem, mas deduplicar na mesma transação é mais difícil                                                             |
| Relatórios por período e saldo acumulado     | Varredura por intervalo da chave primária, `SUM` antes de uma data | Possível com um desenho de chaves cuidadoso, mas menos flexível para consultas ad hoc                                                |

| Outra alternativa               | Por que não foi escolhida                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Um único banco compartilhado    | Acopla os serviços no nível dos dados: uma migration ou sobrecarga de um lado afeta o outro               |
| Um ORM (Prisma, TypeORM)        | Esconde exatamente as construções de que a solução depende (`SKIP LOCKED`, `ON CONFLICT`, advisory locks) |
| Ferramenta externa de migration | Um passo a mais no deploy; as migrations em TypeScript são compiladas na imagem e rodam sob advisory lock |

O NoSQL seria reconsiderado para volumes e padrões de acesso que não caibam em um único nó relacional (por exemplo, guardar eventos brutos em escala muito alta). Nesse caso, a estrutura hexagonal ([ADR-0003](0003-hexagonal-architecture.md)) restringe a mudança aos adapters de repositório.

## Consequências

**Positivas**

- As invariantes valem mesmo com requisições concorrentes (testes de integração: requisições simultâneas com a mesma chave de idempotência gravam um único lançamento; estornos simultâneos produzem um sucesso e um conflito; entregas simultâneas do mesmo evento são contadas uma vez).
- Um banco por serviço preserva o isolamento de falhas exigido pela [ADR-0002](0002-event-driven-microservices.md).

**Negativas / trade-offs**

- Limites de escala vertical para escritas em um único primário; tratados depois com réplicas de leitura e particionamento, se necessário (veja as [evoluções futuras](../08-future-evolutions.md)).
- Uma conexão ociosa encerrada pelo servidor faz o `pg` emitir um evento `error` no pool, o que derruba o Node se não for tratado. Todos os pools agora tratam esse evento (problema encontrado nos testes de resiliência e coberto por um teste de regressão).

## Evidências

- Schema do ledger: [0001-create-points-of-sale-and-entries.ts](../../services/ledger/src/adapters/outbound/postgres/migrations/0001-create-points-of-sale-and-entries.ts)
- Schema do consolidado: [0001-create-daily-balances.ts](../../services/daily-balance/src/adapters/outbound/postgres/migrations/0001-create-daily-balances.ts), [0002-create-applied-movements.ts](../../services/daily-balance/src/adapters/outbound/postgres/migrations/0002-create-applied-movements.ts)
- Transações e tratamento de erros do pool: [postgres-database.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-database.ts)
- Migrations sob advisory lock: [postgres-migrator.ts](../../services/ledger/src/adapters/outbound/postgres/postgres-migrator.ts)

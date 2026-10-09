# ADR-0009: Data de competência e fusos horários por ponto de venda

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

Um relatório de caixa diário agrupa lançamentos por "dia", mas qual dia? O Brasil tem quatro fusos horários. Uma venda à 00h30 em Fernando de Noronha (UTC-2) é 23h30 do dia anterior em Brasília. Com um único fuso no servidor, essa venda cairia no dia errado ou seria rejeitada como data futura. Os comerciantes também registram lançamentos com atraso (uma venda de ontem lançada hoje de manhã). E o desafio descreve um relatório diário, que é um conceito de negócio, não um timestamp técnico.

## Decisão

- Separar a **data de competência** (`businessDate`, o dia do caixa ao qual o lançamento pertence, `YYYY-MM-DD`) do **instante do registro** (`recordedAt`, em UTC).
- Cada **ponto de venda** é configurado com um **fuso IANA** (`America/Manaus`, não `-04:00`); lançamentos sem ponto de venda usam um padrão configurável (`DEFAULT_TIME_ZONE`, `America/Sao_Paulo`).
- Quando o cliente não envia a data de competência, ela é o dia de hoje no fuso do ponto de venda. Datas de competência não podem ser futuras (nesse fuso) nem anteriores a `MAX_BACKDATED_DAYS` (30).
- O fuso vigente é **gravado em cada lançamento**; a hora local é **derivada** na leitura (`recordedAtLocal`), nunca armazenada.
- Um estorno mantém a data de competência, o ponto de venda e o fuso do original, então corrige o dia certo.
- O **consolidado não sabe nada de fusos**: os eventos carregam a data de competência já resolvida.

## Alternativas consideradas

| Alternativa                                    | Por que não foi escolhida                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Agrupar por `recordedAt` em um único fuso      | Dia errado para comerciantes em outros fusos; impossível registrar lançamentos atrasados no dia certo |
| Guardar deslocamentos UTC em vez de nomes IANA | Deslocamentos não carregam regras de horário de verão; se ele voltar, basta atualizar a base IANA     |
| Guardar a hora local além do UTC               | Redundante e pode divergir; é derivável do instante e do fuso gravado                                 |
| Resolver a data de competência no consolidador | Espalha a lógica de fuso entre serviços; o ledger é onde o lançamento nasce                           |

## Consequências

**Positivas**

- Dias corretos para todos os fusos brasileiros (os testes cobrem Noronha, Manaus e Rio Branco perto da meia-noite).
- Mudar o fuso de um ponto de venda nunca reinterpreta lançamentos passados.
- O consolidador continua simples e independente de fusos.

**Negativas / trade-offs**

- Os clientes precisam entender que `businessDate` e `recordedAt` podem ser dias diferentes.
- A janela de retroatividade é uma decisão de política; o fechamento de dias passados ("fechamento do mês") é uma evolução futura.

## Evidências

- Value objects: [business-date.ts](../../services/ledger/src/domain/entry/business-date.ts), [time-zone.ts](../../services/ledger/src/domain/shared/time-zone.ts), [business-date-policy.ts](../../services/ledger/src/domain/entry/business-date-policy.ts)
- Resolução do fuso: [time-zone-resolver.ts](../../services/ledger/src/application/services/time-zone-resolver.ts)
- Agregado do ponto de venda: [point-of-sale.ts](../../services/ledger/src/domain/point-of-sale/point-of-sale.ts)

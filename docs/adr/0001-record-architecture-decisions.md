# ADR-0001: Registrar as decisões de arquitetura

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

A solução foi construída em fases, e muitas decisões foram tomadas ao longo do caminho: algumas planejadas de antemão (divisão em serviços, mensageria), outras impostas pelo que os testes revelaram (retentativa por mensagem no relay do outbox, tratamento da perda de conexões ociosas, semântica do readiness para dependências compartilhadas). O código mostra _o que_ foi feito, mas não _por que_, nem quais alternativas foram consideradas. Por convenção, o código não tem comentários, então o raciocínio precisa ficar registrado em outro lugar.

## Decisão

As decisões arquiteturalmente significativas são registradas como Architecture Decision Records leves, no formato de Michael Nygard, em `docs/adr/`:

- um arquivo por decisão, numerado em sequência e nunca renumerado;
- seções: Contexto, Decisão, Alternativas consideradas, Consequências e Evidências, apontando para o código que implementa a decisão;
- um ADR é imutável depois de aceito; uma mudança de direção é um novo ADR que substitui o anterior, e o anterior tem o status atualizado para `Substituída pela ADR-XXXX`;
- os ADRs fazem parte da documentação do projeto em `docs/`; o README mantém uma tabela resumida de justificativas e aponta para cá.

## Alternativas consideradas

| Alternativa                                 | Por que não foi escolhida                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Comentários no código                       | O projeto proíbe comentários; além disso, comentários descrevem o código, não as alternativas descartadas |
| Uma wiki ou documento fora do repositório   | Diverge do código e se perde quando o repositório é clonado ou copiado                                    |
| Apenas a tabela de justificativas do README | Boa como resumo, mas curta demais para registrar contexto e consequências                                 |

## Consequências

- **Positivas:** avaliadores e futuros mantenedores entendem os trade-offs sem precisar reconstruí-los; as decisões são revisadas nos pull requests junto com o código que as implementa.
- **Negativas:** os ADRs precisam ser mantidos coerentes quando uma decisão é revista; isso é mitigado pela regra de substituição, em vez de editar o histórico.

## Evidências

- Índice: [README.md](README.md)
- Resumo no README do repositório: [README "Justificativa das decisões de arquitetura e tecnologia"](../../README.md#justificativa-das-decisões-de-arquitetura-e-tecnologia)

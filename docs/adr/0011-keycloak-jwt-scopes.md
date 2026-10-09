# ADR-0011: Keycloak, validação de JWT e escopos OAuth

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

As duas APIs expõem dados financeiros de um comerciante. Quem chama precisa estar autenticado, só pode ver os dados do próprio comerciante, e usuários diferentes precisam de permissões diferentes (um operador registra lançamentos; um analista apenas consulta). Antes desta decisão, o comerciante era identificado por um header `x-merchant-id`, que qualquer cliente podia forjar. A autenticação também não pode virar um novo ponto de falha em cada requisição, o que comprometeria os requisitos de disponibilidade.

## Decisão

- **Keycloak 26** é o provedor OpenID Connect. O realm é versionado como código e importado na inicialização: client `cash-flow-app` (público, Authorization Code com PKCE), mapper de audiência `cash-flow-api`, mapper da claim `merchant_id`, papéis, escopos e usuários de demonstração.
- **Os tokens são validados localmente** por cada serviço com `jose`: assinatura RS256 contra o JWKS (chaves buscadas no primeiro uso e mantidas em cache; buscadas de novo apenas para um key id desconhecido), emissor, audiência, expiração com tolerância de 5 s, presença de `sub` e de um `merchant_id` em formato UUID.
- **O comerciante vem apenas do token.** O `x-merchant-id` foi removido. `merchant_id` é um atributo do usuário declarado no perfil de usuário do realm como **editável apenas por administradores**, então o usuário não consegue alterá-lo no console da conta.
- **Autorização por escopos OAuth em cada rota**: `ledger:write`, `ledger:read`, `balance:read`. Os escopos estão **vinculados a papéis** no Keycloak (`merchant-operator`, `merchant-viewer`), então um escopo só é emitido se o usuário tiver o papel.
- Os erros seguem a RFC 6750: `401` com `WWW-Authenticate: Bearer` (`error="invalid_token"` para tokens inválidos), `403` com `error="insufficient_scope"`. Se as chaves não puderem ser obtidas, a resposta é `503 AUTHENTICATION_UNAVAILABLE`, não `401`.
- Proteções adicionais: rate limiting por comerciante (1.200 req/min no ledger e 6.000 req/min no consolidado, o dobro do pico exigido), headers de segurança via `@fastify/helmet`, limite de 16 KiB no corpo das requisições do ledger, rotas de health e de documentação públicas.
- O **fluxo de senha** (ROPC) fica habilitado no client apenas para uso local e para os testes de carga; em produção ele deve ser desabilitado.
- A segurança fica no adapter HTTP; os casos de uso continuam recebendo apenas um `merchantId`.

## Alternativas consideradas

| Alternativa                              | Por que não foi escolhida                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Introspecção do token em cada requisição | Coloca o Keycloak no caminho crítico de toda chamada; a validação local pelo JWKS não                                                                 |
| Auth0, Cognito, Entra ID                 | Gerenciados e prontos para produção, mas não rodam localmente; os serviços dependem apenas de OIDC/JWT padrão, então trocar é questão de configuração |
| Emitir tokens dentro dos serviços        | Reimplementa identidade, armazenamento de senhas e rotação de chaves                                                                                  |
| Papéis no token em vez de escopos        | Funciona, mas escopos são a forma padrão do OAuth de expressar permissões de API e desacoplam as APIs do modelo de papéis                             |
| `jsonwebtoken` + `jwks-rsa`              | Duas bibliotecas para o papel de uma; `jose` não tem dependências nativas e também foi usada para assinar tokens nos testes                           |
| Rate limit apenas no gateway             | Não há gateway rodando localmente; o limite na aplicação é uma segunda camada em produção                                                             |

## Consequências

**Positivas**

- Um cliente não consegue se passar por outro comerciante (testado: um `x-merchant-id` forjado é ignorado; o lançamento de outro comerciante retorna `404`).
- Uma queda do Keycloak não afeta requisições com tokens já emitidos; os serviços sobem sem o Keycloak.
- A configuração do realm é testada: um teste de integração sobe o Keycloak a partir do arquivo do realm e confere as claims, os escopos por papel e a autorização de ponta a ponta.

**Negativas / trade-offs**

- Tokens revogados continuam válidos até expirar (5 minutos). Mitigado pela vida curta.
- O rate limiting é por réplica, em memória; com várias réplicas o limite efetivo se multiplica, a menos que se use um armazenamento compartilhado ou o gateway.
- O ROPC habilitado por conveniência local é um desvio conhecido do OAuth 2.1, documentado e a ser desabilitado em produção.

## Evidências

- Realm como código: [cash-flow-realm.json](../../infra/keycloak/cash-flow-realm.json)
- Verificação do token: [jose-token-verifier.ts](../../services/ledger/src/adapters/inbound/http/security/jose-token-verifier.ts)
- Autenticação e escopos por rota: [authentication.ts](../../services/ledger/src/adapters/inbound/http/security/authentication.ts), [entry-routes.ts](../../services/ledger/src/adapters/inbound/http/routes/entry-routes.ts)
- Rate limiting e headers: [rate-limiting.ts](../../services/ledger/src/adapters/inbound/http/security/rate-limiting.ts), [http-security.ts](../../services/ledger/src/adapters/inbound/http/security/http-security.ts)

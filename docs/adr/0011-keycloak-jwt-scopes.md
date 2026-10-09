# ADR-0011: Keycloak, JWT validation and OAuth scopes

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Both APIs expose financial data of a merchant. A caller must be authenticated, must only see its own merchant's data, and different users need different permissions (an operator records entries; an analyst only reads). Before this decision the merchant was identified by an `x-merchant-id` header, which any client could forge. Authentication must not become a new point of failure on every request, which would compromise the availability requirements.

## Decision

- **Keycloak 26** is the OpenID Connect provider. The realm is versioned as code and imported at startup: client `cash-flow-app` (public, Authorization Code with PKCE), audience mapper `cash-flow-api`, claim mapper for `merchant_id`, roles, scopes and demo users.
- **Tokens are validated locally** by each service with `jose`: RS256 signature against the JWKS (keys fetched on first use and cached; refetched only for an unknown key id), issuer, audience, expiry with 5 s tolerance, presence of `sub` and a UUID `merchant_id`.
- **The merchant comes only from the token.** `x-merchant-id` was removed. `merchant_id` is a user attribute declared in the realm user profile as **editable by administrators only**, so a user cannot change it in the account console.
- **Authorization by OAuth scopes per route**: `ledger:write`, `ledger:read`, `balance:read`. Scopes are **bound to roles** in Keycloak (`merchant-operator`, `merchant-viewer`), so a scope is issued only if the user has the role.
- Errors follow RFC 6750: `401` with `WWW-Authenticate: Bearer` (`error="invalid_token"` for bad tokens), `403` with `error="insufficient_scope"`. If the keys cannot be fetched the answer is `503 AUTHENTICATION_UNAVAILABLE`, not `401`.
- Additional protections: rate limiting per merchant (1,200 req/min on the ledger, 6,000 req/min on the daily balance, twice the required peak), security headers via `@fastify/helmet`, 16 KiB body limit on the ledger, health and documentation routes public.
- The **password grant** (ROPC) is enabled on the client only for local use and the load tests; production must disable it.
- Security lives in the HTTP adapter; use cases still receive only a `merchantId`.

## Alternatives considered

| Alternative                          | Why it was not chosen                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Token introspection on every request | Puts Keycloak in the critical path of every call; local JWKS validation does not                                                     |
| Auth0, Cognito, Entra ID             | Managed and production-ready, but not runnable locally; the services only depend on standard OIDC/JWT, so switching is configuration |
| Issue tokens inside the services     | Reimplements identity, password storage and key rotation                                                                             |
| Roles in the token instead of scopes | Works, but scopes are the OAuth-standard way to express API permissions and decouple APIs from the role model                        |
| `jsonwebtoken` + `jwks-rsa`          | Two libraries for the role of one; `jose` has no native dependencies and was also used to sign tokens in tests                       |
| Rate limit only at the gateway       | No gateway runs locally; the in-app limit is a second layer in production                                                            |

## Consequences

**Positive**

- A client cannot impersonate another merchant (tested: a forged `x-merchant-id` is ignored; another merchant's entry returns `404`).
- A Keycloak outage does not affect requests with tokens already issued; services start without Keycloak.
- The realm configuration is tested: an integration test starts Keycloak from the realm file and checks claims, scopes per role and the end-to-end authorization.

**Negative / trade-offs**

- Revoked tokens remain valid until expiry (5 minutes). Mitigated by the short lifespan.
- Rate limiting is per replica in memory; with several replicas the effective limit multiplies unless a shared store or the gateway is used.
- ROPC enabled for local convenience is a known deviation from OAuth 2.1, documented and to be disabled in production.

## Evidence

- Realm as code: [cash-flow-realm.json](../../infra/keycloak/cash-flow-realm.json)
- Token verification: [jose-token-verifier.ts](../../services/ledger/src/adapters/inbound/http/security/jose-token-verifier.ts)
- Authentication and scopes per route: [authentication.ts](../../services/ledger/src/adapters/inbound/http/security/authentication.ts), [entry-routes.ts](../../services/ledger/src/adapters/inbound/http/routes/entry-routes.ts)
- Rate limiting and headers: [rate-limiting.ts](../../services/ledger/src/adapters/inbound/http/security/rate-limiting.ts), [http-security.ts](../../services/ledger/src/adapters/inbound/http/security/http-security.ts)

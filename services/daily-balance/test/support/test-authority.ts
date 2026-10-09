import { randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import type { HttpSecurityOptions } from '../../src/adapters/inbound/http/security/http-security.js';
import { JoseTokenVerifier } from '../../src/adapters/inbound/http/security/jose-token-verifier.js';
import type { TokenVerifier } from '../../src/adapters/inbound/http/security/token-verifier.js';

export const TEST_ISSUER = 'https://auth.test/realms/cash-flow';
export const TEST_AUDIENCE = 'cash-flow-api';
export const ALL_SCOPES = ['balance:read'];

const KEY_ID = 'test-key';

export interface TokenClaims {
  readonly merchantId?: string | null;
  readonly scopes?: readonly string[];
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresInSeconds?: number;
}

export interface TestAuthority {
  readonly verifier: TokenVerifier;
  tokenFor(merchantId: string, claims?: TokenClaims): Promise<string>;
  headersFor(merchantId: string, claims?: TokenClaims): Promise<{ authorization: string }>;
  security(rateLimit?: HttpSecurityOptions['rateLimit']): HttpSecurityOptions;
}

const sign = (privateKey: CryptoKey, merchantId: string, claims: TokenClaims): Promise<string> => {
  const merchant = claims.merchantId === undefined ? merchantId : claims.merchantId;
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    ...(merchant === null ? {} : { merchant_id: merchant }),
    scope: (claims.scopes ?? ALL_SCOPES).join(' '),
  })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setSubject(randomUUID())
    .setIssuer(claims.issuer ?? TEST_ISSUER)
    .setAudience(claims.audience ?? TEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expiresInSeconds ?? 3_600))
    .sign(privateKey);
};

export const createTestAuthority = async (): Promise<TestAuthority> => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256' };
  const verifier = new JoseTokenVerifier(createLocalJWKSet({ keys: [jwk] }), {
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
  const tokenFor = (merchantId: string, claims: TokenClaims = {}) =>
    sign(privateKey, merchantId, claims);

  return {
    verifier,
    tokenFor,
    headersFor: async (merchantId, claims) => ({
      authorization: `Bearer ${await tokenFor(merchantId, claims)}`,
    }),
    security: (rateLimit = { max: 10_000, timeWindowMs: 60_000 }) => ({ verifier, rateLimit }),
  };
};

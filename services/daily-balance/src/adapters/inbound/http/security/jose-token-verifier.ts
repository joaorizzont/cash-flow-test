import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Principal } from './principal.js';
import {
  AuthenticationUnavailableError,
  InvalidTokenError,
  type TokenVerifier,
} from './token-verifier.js';

export interface TokenSettings {
  readonly issuer: string;
  readonly audience: string;
}

export interface RemoteTokenSettings extends TokenSettings {
  readonly jwksUrl: string;
}

const ALGORITHMS = ['RS256'];
const CLOCK_TOLERANCE_SECONDS = 5;
const JWKS_TIMEOUT_MS = 2_000;
const MERCHANT_CLAIM = 'merchant_id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRejectedToken = (error: unknown): boolean =>
  error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout);

const principalFrom = (payload: JWTPayload): Principal => {
  const merchantId = payload[MERCHANT_CLAIM];
  if (typeof merchantId !== 'string' || !UUID_PATTERN.test(merchantId)) {
    throw new InvalidTokenError('Token does not identify a merchant');
  }
  if (typeof payload.sub !== 'string') {
    throw new InvalidTokenError('Token has no subject');
  }
  const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';
  return {
    subject: payload.sub,
    merchantId: merchantId.toLowerCase(),
    scopes: new Set(scope.split(' ').filter(Boolean)),
  };
};

export class JoseTokenVerifier implements TokenVerifier {
  constructor(
    private readonly keys: JWTVerifyGetKey,
    private readonly settings: TokenSettings,
  ) {}

  static remote(settings: RemoteTokenSettings): JoseTokenVerifier {
    const keys = createRemoteJWKSet(new URL(settings.jwksUrl), {
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
    return new JoseTokenVerifier(keys, settings);
  }

  async verify(token: string): Promise<Principal> {
    const payload = await this.verifiedPayload(token);
    return principalFrom(payload);
  }

  private async verifiedPayload(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        algorithms: ALGORITHMS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      return payload;
    } catch (error) {
      if (isRejectedToken(error)) {
        throw new InvalidTokenError((error as Error).message);
      }
      throw new AuthenticationUnavailableError(error);
    }
  }
}

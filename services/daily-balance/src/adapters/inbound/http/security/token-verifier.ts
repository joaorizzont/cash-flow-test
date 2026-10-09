import type { Principal } from './principal.js';

export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidTokenError';
  }
}

export class AuthenticationUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'AUTHENTICATION_UNAVAILABLE';

  constructor(cause: unknown) {
    super('Unable to verify the access token', { cause });
    this.name = 'AuthenticationUnavailableError';
  }
}

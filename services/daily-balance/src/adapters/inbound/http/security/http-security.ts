import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import { authentication } from './authentication.js';
import { registerRateLimiting, type RateLimitSettings } from './rate-limiting.js';
import type { TokenVerifier } from './token-verifier.js';

export interface HttpSecurityOptions {
  readonly verifier: TokenVerifier;
  readonly rateLimit: RateLimitSettings;
}

export const BEARER_SECURITY_SCHEME = {
  bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
} as const;

export const withoutInsecureRequestUpgrade = (policy: string): string =>
  policy.replace(/\s*upgrade-insecure-requests;?/, '');

export const registerHttpSecurity = async (
  app: FastifyInstance,
  options: HttpSecurityOptions,
): Promise<void> => {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
  await app.register(authentication, { verifier: options.verifier });
  await registerRateLimiting(app, options.rateLimit);
};

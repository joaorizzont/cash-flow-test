import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export interface RateLimitSettings {
  readonly max: number;
  readonly timeWindowMs: number;
}

class RateLimitExceededError extends Error {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
}

export const registerRateLimiting = async (
  app: FastifyInstance,
  settings: RateLimitSettings,
): Promise<void> => {
  await app.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    max: settings.max,
    timeWindow: settings.timeWindowMs,
    keyGenerator: (request) => request.principal?.merchantId ?? request.ip,
    errorResponseBuilder: (_request, context) =>
      new RateLimitExceededError(`Rate limit exceeded, retry in ${context.after}`),
  });
};

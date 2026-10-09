import type { FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { sendProblem } from '../problem-details.js';
import type { Principal } from './principal.js';
import { InvalidTokenError, type TokenVerifier } from './token-verifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }

  interface FastifyContextConfig {
    requiredScope?: string;
  }
}

export interface AuthenticationOptions {
  readonly verifier: TokenVerifier;
}

const REALM = 'cash-flow';
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

const bearerTokenOf = (request: FastifyRequest): string | undefined =>
  BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1];

const unauthorized = (reply: FastifyReply, detail: string, error?: string): FastifyReply => {
  const challenge = error === undefined ? '' : `, error="${error}"`;
  reply.header('www-authenticate', `Bearer realm="${REALM}"${challenge}`);
  return sendProblem(reply, { status: 401, code: 'UNAUTHORIZED', detail });
};

const forbidden = (reply: FastifyReply, scope: string): FastifyReply => {
  reply.header(
    'www-authenticate',
    `Bearer realm="${REALM}", error="insufficient_scope", scope="${scope}"`,
  );
  return sendProblem(reply, {
    status: 403,
    code: 'INSUFFICIENT_SCOPE',
    detail: `The access token does not grant the ${scope} scope`,
  });
};

export const principalOf = (request: FastifyRequest): Principal => {
  if (request.principal === null) {
    throw new Error('The route was reached without an authenticated principal');
  }
  return request.principal;
};

export const authentication = fastifyPlugin<AuthenticationOptions>(
  async (app, { verifier }) => {
    app.decorateRequest('principal', null);

    const authenticate = async (request: FastifyRequest, reply: FastifyReply, scope: string) => {
      const token = bearerTokenOf(request);
      if (token === undefined) {
        return unauthorized(reply, 'A bearer access token is required');
      }
      try {
        request.principal = await verifier.verify(token);
      } catch (error) {
        if (!(error instanceof InvalidTokenError)) {
          throw error;
        }
        request.log.warn({ reason: error.message }, 'rejected access token');
        return unauthorized(reply, 'The access token is invalid or expired', 'invalid_token');
      }
      return request.principal.scopes.has(scope) ? undefined : forbidden(reply, scope);
    };

    app.addHook('onRequest', async (request, reply) => {
      const { requiredScope } = request.routeOptions.config;
      return requiredScope === undefined ? undefined : authenticate(request, reply, requiredScope);
    });
  },
  { name: 'authentication' },
);

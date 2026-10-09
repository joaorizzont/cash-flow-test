import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../application/index.js';
import type { LedgerApi } from './ledger-api.js';
import { handleError, handleNotFound } from './problem-details.js';
import { entryRoutes } from './routes/entry-routes.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { pointOfSaleRoutes } from './routes/point-of-sale-routes.js';
import { ProblemSchema } from './schemas/common-schemas.js';
import {
  BEARER_SECURITY_SCHEME,
  registerHttpSecurity,
  type HttpSecurityOptions,
  withoutInsecureRequestUpgrade,
} from './security/http-security.js';

export interface HttpServerOptions {
  readonly serviceName: string;
  readonly logLevel: string;
  readonly healthIndicators: readonly HealthIndicator[];
  readonly api: LedgerApi;
  readonly security: HttpSecurityOptions;
}

const BODY_LIMIT_BYTES = 16 * 1024;

const OPEN_API_INFO = {
  title: 'Ledger API',
  description: 'Records and reverses cash flow entries of a merchant',
  version: '1.0.0',
};

export const buildHttpServer = async (options: HttpServerOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: { level: options.logLevel, base: { service: options.serviceName } },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addSchema(ProblemSchema);
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  await registerHttpSecurity(app, options.security);
  await app.register(swagger, {
    openapi: {
      info: OPEN_API_INFO,
      components: { securitySchemes: BEARER_SECURITY_SCHEME },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    staticCSP: true,
    transformStaticCSP: withoutInsecureRequestUpgrade,
  });

  registerHealthRoutes(app, options.healthIndicators);
  await app.register(entryRoutes(options.api));
  await app.register(pointOfSaleRoutes(options.api));

  return app;
};

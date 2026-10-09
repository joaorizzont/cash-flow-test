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

export interface HttpServerOptions {
  readonly serviceName: string;
  readonly logLevel: string;
  readonly healthIndicators: readonly HealthIndicator[];
  readonly api: LedgerApi;
}

const OPEN_API_INFO = {
  title: 'Ledger API',
  description: 'Records and reverses cash flow entries of a merchant',
  version: '1.0.0',
};

export const buildHttpServer = async (options: HttpServerOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: { level: options.logLevel, base: { service: options.serviceName } },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addSchema(ProblemSchema);
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  await app.register(swagger, { openapi: { info: OPEN_API_INFO } });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerHealthRoutes(app, options.healthIndicators);
  await app.register(entryRoutes(options.api));
  await app.register(pointOfSaleRoutes(options.api));

  return app;
};

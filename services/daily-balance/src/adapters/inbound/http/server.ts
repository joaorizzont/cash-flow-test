import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../application/index.js';
import type { DailyBalanceApi } from './daily-balance-api.js';
import { handleError, handleNotFound } from './problem-details.js';
import { dailyBalanceRoutes } from './routes/daily-balance-routes.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { ProblemSchema } from './schemas/common-schemas.js';

export interface HttpServerOptions {
  readonly logger: FastifyBaseLogger;
  readonly healthIndicators: readonly HealthIndicator[];
  readonly api: DailyBalanceApi;
}

const OPEN_API_INFO = {
  title: 'Daily Balance API',
  description: 'Consolidated daily balances of a merchant cash flow',
  version: '1.0.0',
};

export const buildHttpServer = async (options: HttpServerOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: options.logger,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addSchema(ProblemSchema);
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  await app.register(swagger, { openapi: { info: OPEN_API_INFO } });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerHealthRoutes(app, options.healthIndicators);
  await app.register(dailyBalanceRoutes(options.api));

  return app;
};

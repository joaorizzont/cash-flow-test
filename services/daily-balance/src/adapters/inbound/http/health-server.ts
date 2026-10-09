import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../application/index.js';
import { registerHealthRoutes } from './routes/health-routes.js';

export interface HealthServerOptions {
  readonly logger: FastifyBaseLogger;
  readonly healthIndicators: readonly HealthIndicator[];
}

export const buildHealthServer = (options: HealthServerOptions): FastifyInstance => {
  const app = Fastify({ loggerInstance: options.logger });
  registerHealthRoutes(app, options.healthIndicators);
  return app;
};

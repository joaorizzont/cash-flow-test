import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../application/ports/outbound/health-indicator.js';
import { registerHealthRoutes } from './routes/health-routes.js';

export interface HttpServerOptions {
  readonly serviceName: string;
  readonly logLevel: string;
  readonly healthIndicators: readonly HealthIndicator[];
}

export const buildHttpServer = (options: HttpServerOptions): FastifyInstance => {
  const app = Fastify({
    logger: { level: options.logLevel, base: { service: options.serviceName } },
  });

  registerHealthRoutes(app, options.healthIndicators);

  return app;
};

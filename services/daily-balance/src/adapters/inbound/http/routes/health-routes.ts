import type { FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../../application/ports/outbound/health-indicator.js';

type Status = 'up' | 'down';

interface DependencyHealth {
  readonly name: string;
  readonly status: Status;
}

const checkDependency = async (indicator: HealthIndicator): Promise<DependencyHealth> => {
  const isHealthy = await indicator.isHealthy().catch(() => false);
  return { name: indicator.name, status: isHealthy ? 'up' : 'down' };
};

export const registerHealthRoutes = (
  app: FastifyInstance,
  indicators: readonly HealthIndicator[],
): void => {
  app.get('/health/live', async () => ({ status: 'up' satisfies Status }));

  app.get('/health/ready', async (_request, reply) => {
    const dependencies = await Promise.all(indicators.map(checkDependency));
    const isReady = dependencies.every((dependency) => dependency.status === 'up');
    const status: Status = isReady ? 'up' : 'down';
    return reply.code(isReady ? 200 : 503).send({ status, dependencies });
  });
};

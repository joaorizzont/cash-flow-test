import type { FastifyInstance } from 'fastify';
import type { HealthIndicator } from '../../../../application/index.js';

type DependencyStatus = 'up' | 'down';
type Status = DependencyStatus | 'degraded';

interface DependencyHealth {
  readonly name: string;
  readonly status: DependencyStatus;
  readonly critical: boolean;
}

const checkDependency = async (indicator: HealthIndicator): Promise<DependencyHealth> => {
  const isHealthy = await indicator.isHealthy().catch(() => false);
  return {
    name: indicator.name,
    status: isHealthy ? 'up' : 'down',
    critical: indicator.critical ?? true,
  };
};

const overallStatus = (dependencies: readonly DependencyHealth[]): Status => {
  const down = dependencies.filter((dependency) => dependency.status === 'down');
  if (down.some((dependency) => dependency.critical)) {
    return 'down';
  }
  return down.length > 0 ? 'degraded' : 'up';
};

export const registerHealthRoutes = (
  app: FastifyInstance,
  indicators: readonly HealthIndicator[],
): void => {
  const options = { logLevel: 'warn', schema: { hide: true } } as const;

  app.get('/health/live', options, async () => ({ status: 'up' satisfies Status }));

  app.get('/health/ready', options, async (_request, reply) => {
    const dependencies = await Promise.all(indicators.map(checkDependency));
    const status = overallStatus(dependencies);
    return reply.code(status === 'down' ? 503 : 200).send({ status, dependencies });
  });
};

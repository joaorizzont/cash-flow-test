import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHealthServer } from '../../../../src/adapters/inbound/http/health-server.js';
import type { HealthIndicator } from '../../../../src/application/index.js';

const indicator = (
  name: string,
  isHealthy: () => Promise<boolean>,
  critical?: boolean,
): HealthIndicator => ({ name, isHealthy, ...(critical === undefined ? {} : { critical }) });

const up = async () => true;
const down = async () => false;

describe('health routes', () => {
  let server: FastifyInstance;

  const ready = async (healthIndicators: readonly HealthIndicator[]) => {
    server = buildHealthServer({ logger: pino({ level: 'silent' }), healthIndicators });
    return server.inject({ method: 'GET', url: '/health/ready' });
  };

  afterEach(async () => {
    await server.close();
  });

  it('reports liveness', async () => {
    server = buildHealthServer({ logger: pino({ level: 'silent' }), healthIndicators: [] });

    const response = await server.inject({ method: 'GET', url: '/health/live' });

    expect(response.json()).toEqual({ status: 'up' });
  });

  it('reports ready when every dependency is healthy', async () => {
    const response = await ready([indicator('postgres', up), indicator('redis', up, false)]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'up',
      dependencies: [
        { name: 'postgres', status: 'up', critical: true },
        { name: 'redis', status: 'up', critical: false },
      ],
    });
  });

  it('stays ready but degraded when a non critical dependency is down', async () => {
    const response = await ready([indicator('postgres', up), indicator('redis', down, false)]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'degraded' });
  });

  it('reports not ready when a critical dependency is down or throws', async () => {
    const response = await ready([
      indicator('postgres', async () => {
        throw new Error('connection refused');
      }),
      indicator('redis', up, false),
    ]);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'down' });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildHttpServer } from '../../../../src/adapters/inbound/http/server.js';
import type { HealthIndicator } from '../../../../src/application/index.js';
import { NOW } from '../../../support/entry-fixtures.js';
import { createInMemoryLedger } from '../../../support/in-memory-ledger.js';

const indicator = (name: string, isHealthy: () => Promise<boolean>): HealthIndicator => ({
  name,
  isHealthy,
});

const buildServer = (healthIndicators: readonly HealthIndicator[]): Promise<FastifyInstance> =>
  buildHttpServer({
    serviceName: 'test',
    logLevel: 'silent',
    healthIndicators,
    api: createInMemoryLedger(NOW).api,
  });

describe('health routes', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server.close();
  });

  it('reports liveness', async () => {
    server = await buildServer([]);

    const response = await server.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'up' });
  });

  it('reports ready when every dependency is healthy', async () => {
    server = await buildServer([indicator('database', async () => true)]);

    const response = await server.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'up',
      dependencies: [{ name: 'database', status: 'up' }],
    });
  });

  it('reports not ready when a dependency is unhealthy or throws', async () => {
    server = await buildServer([
      indicator('database', async () => false),
      indicator('cache', async () => {
        throw new Error('connection refused');
      }),
    ]);

    const response = await server.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'down',
      dependencies: [
        { name: 'database', status: 'down' },
        { name: 'cache', status: 'down' },
      ],
    });
  });
});

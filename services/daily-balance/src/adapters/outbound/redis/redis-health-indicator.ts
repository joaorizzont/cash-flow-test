import type { HealthIndicator } from '../../../application/index.js';
import type { RedisConnection } from './redis-connection.js';

export class RedisHealthIndicator implements HealthIndicator {
  readonly name = 'redis';
  readonly critical = false;

  constructor(private readonly connection: RedisConnection) {}

  async isHealthy(): Promise<boolean> {
    return this.connection.isReady();
  }
}

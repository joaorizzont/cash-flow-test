import type { HealthIndicator } from '../../../application/index.js';
import type { Queryable } from './postgres-database.js';

export class PostgresHealthIndicator implements HealthIndicator {
  readonly name = 'postgres';

  constructor(
    private readonly database: Queryable,
    readonly critical = true,
  ) {}

  async isHealthy(): Promise<boolean> {
    await this.database.query('SELECT 1');
    return true;
  }
}

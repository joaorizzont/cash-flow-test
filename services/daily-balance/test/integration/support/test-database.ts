import type pg from 'pg';
import { inject } from 'vitest';
import { dailyBalanceMigrations } from '../../../src/adapters/outbound/postgres/migrations/index.js';
import {
  createPool,
  PostgresDatabase,
} from '../../../src/adapters/outbound/postgres/postgres-database.js';
import { PostgresMigrator } from '../../../src/adapters/outbound/postgres/postgres-migrator.js';

export interface TestDatabase {
  readonly pool: pg.Pool;
  readonly database: PostgresDatabase;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export const connectTestDatabase = async (): Promise<TestDatabase> => {
  const pool = createPool({ connectionString: inject('databaseUrl'), maxConnections: 20 });
  await new PostgresMigrator(pool, dailyBalanceMigrations).migrate();
  const database = new PostgresDatabase(pool);

  return {
    pool,
    database,
    reset: async () => {
      await pool.query('TRUNCATE daily_balances, applied_movements');
    },
    close: () => database.close(),
  };
};

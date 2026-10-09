import type pg from 'pg';
import { inject } from 'vitest';
import { ledgerMigrations } from '../../../src/adapters/outbound/postgres/migrations/index.js';
import {
  createPool,
  PostgresDatabase,
} from '../../../src/adapters/outbound/postgres/postgres-database.js';
import { PostgresMigrator } from '../../../src/adapters/outbound/postgres/postgres-migrator.js';

export interface TestDatabase {
  readonly pool: pg.Pool;
  readonly database: PostgresDatabase;
  reset(): Promise<void>;
  count(table: string): Promise<number>;
  close(): Promise<void>;
}

export const connectTestDatabase = async (): Promise<TestDatabase> => {
  const pool = createPool({ connectionString: inject('databaseUrl'), maxConnections: 5 });
  await new PostgresMigrator(pool, ledgerMigrations).migrate();
  const database = new PostgresDatabase(pool);

  return {
    pool,
    database,
    reset: async () => {
      await pool.query('TRUNCATE entries, outbox, idempotency_keys, points_of_sale CASCADE');
    },
    count: async (table) => {
      const result = await pool.query<{ total: number }>(
        `SELECT count(*)::bigint AS total FROM ${table}`,
      );
      return result.rows[0]?.total ?? 0;
    },
    close: () => database.close(),
  };
};

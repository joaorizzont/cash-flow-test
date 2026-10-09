import type pg from 'pg';
import type { Migration } from './migrations/index.js';

const MIGRATION_LOCK_ID = 7_340_002;

export class PostgresMigrator {
  constructor(
    private readonly pool: pg.Pool,
    private readonly migrations: readonly Migration[],
  ) {}

  async migrate(): Promise<readonly string[]> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const pending = await this.pendingMigrations(client);
      for (const migration of pending) {
        await this.apply(client, migration);
      }
      return pending.map((migration) => migration.id);
    } finally {
      await client
        .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
        .catch(() => undefined);
      client.release();
    }
  }

  private async pendingMigrations(client: pg.PoolClient): Promise<readonly Migration[]> {
    const result = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(result.rows.map((row) => row.id));
    return this.migrations.filter((migration) => !applied.has(migration.id));
  }

  private async apply(client: pg.PoolClient, migration: Migration): Promise<void> {
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

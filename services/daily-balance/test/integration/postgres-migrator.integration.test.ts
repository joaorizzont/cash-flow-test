import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailyBalanceMigrations } from '../../src/adapters/outbound/postgres/migrations/index.js';
import { PostgresMigrator } from '../../src/adapters/outbound/postgres/postgres-migrator.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

describe('PostgresMigrator', () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it('creates the daily balance tables', async () => {
    const result = await testDatabase.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      'applied_movements',
      'daily_balances',
      'schema_migrations',
    ]);
  });

  it('applies nothing when every migration is already applied', async () => {
    const applied = await new PostgresMigrator(testDatabase.pool, dailyBalanceMigrations).migrate();

    expect(applied).toEqual([]);
  });

  it('computes the balance as a generated column', async () => {
    await testDatabase.reset();
    await testDatabase.pool.query(
      `INSERT INTO daily_balances (merchant_id, business_date, total_credits_cents, total_debits_cents, entry_count)
       VALUES ('6f1c2a5e-8d4b-4c3a-9e2f-1a2b3c4d5e6f', '2026-10-09', 1000, 1500, 2)`,
    );

    const result = await testDatabase.pool.query<{ balance_cents: number }>(
      'SELECT balance_cents FROM daily_balances',
    );

    expect(result.rows[0]?.balance_cents).toBe(-500);
  });
});

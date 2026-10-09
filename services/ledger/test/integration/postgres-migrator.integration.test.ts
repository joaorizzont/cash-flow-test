import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { ledgerMigrations } from '../../src/adapters/outbound/postgres/migrations/index.js';
import { createPool } from '../../src/adapters/outbound/postgres/postgres-database.js';
import { PostgresMigrator } from '../../src/adapters/outbound/postgres/postgres-migrator.js';

const databaseUrlFor = (name: string): string => {
  const url = new URL(inject('databaseUrl'));
  url.pathname = `/${name}`;
  return url.toString();
};

describe('PostgresMigrator', () => {
  const databaseName = `migrator_${randomUUID().replaceAll('-', '')}`;
  const admin = createPool({ connectionString: inject('databaseUrl'), maxConnections: 1 });
  const pool = createPool({ connectionString: databaseUrlFor(databaseName), maxConnections: 5 });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${databaseName}`);
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE ${databaseName}`);
    await admin.end();
  });

  it('applies every migration exactly once even when started concurrently', async () => {
    const migrate = () => new PostgresMigrator(pool, ledgerMigrations).migrate();

    const results = await Promise.all([migrate(), migrate(), migrate()]);

    expect(results.flat()).toEqual(ledgerMigrations.map((migration) => migration.id));
    expect(await migrate()).toEqual([]);
  });
});

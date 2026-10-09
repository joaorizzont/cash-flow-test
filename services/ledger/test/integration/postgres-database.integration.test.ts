import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import {
  createPool,
  PostgresDatabase,
} from '../../src/adapters/outbound/postgres/postgres-database.js';

const APPLICATION_NAME = 'idle-connection-test';

const urlWithApplicationName = (): string => {
  const url = new URL(inject('databaseUrl'));
  url.searchParams.set('application_name', APPLICATION_NAME);
  return url.toString();
};

describe('PostgresDatabase connection loss', () => {
  let admin: PostgresDatabase;

  beforeAll(() => {
    admin = new PostgresDatabase(
      createPool({ connectionString: inject('databaseUrl'), maxConnections: 1 }),
    );
  });

  afterAll(async () => {
    await admin.close();
  });

  it('survives idle connections being terminated by the server and reconnects', async () => {
    const onIdleClientError = vi.fn();
    const pool = createPool({
      connectionString: urlWithApplicationName(),
      maxConnections: 2,
      onIdleClientError,
    });
    const database = new PostgresDatabase(pool);
    await Promise.all([database.query('SELECT pg_sleep(0.05)'), database.query('SELECT 1')]);

    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1',
      [APPLICATION_NAME],
    );
    await vi.waitFor(() => expect(pool.totalCount).toBe(0));
    expect(onIdleClientError).toHaveBeenCalled();
    const result = await database.query<{ value: number }>('SELECT 1 AS value');
    await database.close();

    expect(result.rows[0]?.value).toBe(1);
  });
});

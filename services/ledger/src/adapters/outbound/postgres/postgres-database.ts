import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import type { TransactionRunner } from '../../../application/index.js';

export type Row = pg.QueryResultRow;

export interface Queryable {
  query<R extends Row>(text: string, values?: readonly unknown[]): Promise<pg.QueryResult<R>>;
}

export interface PoolSettings {
  readonly connectionString: string;
  readonly maxConnections: number;
  readonly onIdleClientError?: (error: Error) => void;
}

const parseSafeInteger = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`Integer ${value} exceeds the safe integer range`);
  }
  return parsed;
};

pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.INT8, parseSafeInteger);

const ignoreIdleClientError = (): void => undefined;

export const createPool = (settings: PoolSettings): pg.Pool => {
  const pool = new pg.Pool({
    connectionString: settings.connectionString,
    max: settings.maxConnections,
  });
  pool.on('error', settings.onIdleClientError ?? ignoreIdleClientError);
  return pool;
};

export class PostgresDatabase implements Queryable, TransactionRunner {
  private readonly transactionClient = new AsyncLocalStorage<pg.PoolClient>();

  constructor(private readonly pool: pg.Pool) {}

  query<R extends Row>(text: string, values: readonly unknown[] = []): Promise<pg.QueryResult<R>> {
    const executor = this.transactionClient.getStore() ?? this.pool;
    return executor.query<R>(text, [...values]);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionClient.getStore() !== undefined) {
      return work();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.transactionClient.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

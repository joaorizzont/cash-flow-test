import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresIdempotencyStore } from '../../src/adapters/outbound/postgres/postgres-idempotency-store.js';
import { IdempotencyGuard, type IdempotentRequest } from '../../src/application/index.js';
import { MERCHANT_ID } from '../support/entry-fixtures.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

const request: IdempotentRequest = {
  merchantId: MERCHANT_ID,
  key: 'sale-1024',
  operation: 'record-entry',
  fingerprint: 'f'.repeat(64),
};

describe('IdempotencyGuard with PostgreSQL', () => {
  let testDatabase: TestDatabase;
  let guard: IdempotencyGuard;

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    guard = new IdempotencyGuard({
      store: new PostgresIdempotencyStore(testDatabase.database),
      transactions: testDatabase.database,
    });
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  it('executes concurrent requests with the same key only once', async () => {
    let executions = 0;
    const slowWork = async () => {
      executions += 1;
      await setTimeout(200);
      return { id: 'entry-1' };
    };

    const results = await Promise.all([
      guard.execute(request, slowWork),
      guard.execute(request, slowWork),
    ]);

    expect(executions).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]?.value).toEqual(results[1]?.value);
  });

  it('releases the key when the work fails so the client can retry', async () => {
    await expect(
      guard.execute(request, async () => {
        throw new Error('temporary failure');
      }),
    ).rejects.toThrow('temporary failure');

    const retry = await guard.execute(request, async () => ({ id: 'entry-1' }));

    expect(retry).toEqual({ value: { id: 'entry-1' }, replayed: false });
    expect(await testDatabase.count('idempotency_keys')).toBe(1);
  });
});

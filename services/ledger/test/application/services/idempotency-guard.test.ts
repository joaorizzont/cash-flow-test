import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdempotencyGuard,
  IdempotencyKeyReusedError,
  type IdempotentRequest,
} from '../../../src/application/index.js';
import { MERCHANT_ID } from '../../support/entry-fixtures.js';
import { ImmediateTransactionRunner } from '../../support/immediate-transaction-runner.js';
import { InMemoryIdempotencyStore } from '../../support/in-memory-idempotency-store.js';

const request = (overrides: Partial<IdempotentRequest> = {}): IdempotentRequest => ({
  merchantId: MERCHANT_ID,
  key: 'key-1',
  operation: 'record-entry',
  fingerprint: 'a'.repeat(64),
  ...overrides,
});

describe('IdempotencyGuard', () => {
  let guard: IdempotencyGuard;

  beforeEach(() => {
    guard = new IdempotencyGuard({
      store: new InMemoryIdempotencyStore(),
      transactions: new ImmediateTransactionRunner(),
    });
  });

  it('executes the work once and replays the stored result', async () => {
    const work = vi.fn(async () => ({ id: 'entry-1' }));

    const first = await guard.execute(request(), work);
    const second = await guard.execute(request(), work);

    expect(first).toEqual({ value: { id: 'entry-1' }, replayed: false });
    expect(second).toEqual({ value: { id: 'entry-1' }, replayed: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('always executes the work without a key', async () => {
    const work = vi.fn(async () => 'done');

    await guard.execute(request({ key: null }), work);
    await guard.execute(request({ key: null }), work);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it.each([{ fingerprint: 'b'.repeat(64) }, { operation: 'reverse-entry' }])(
    'rejects the same key with a different request %j',
    async (overrides) => {
      await guard.execute(request(), async () => 'done');

      await expect(guard.execute(request(overrides), async () => 'other')).rejects.toThrow(
        IdempotencyKeyReusedError,
      );
    },
  );
});

import { describe, expect, it } from 'vitest';
import {
  MessageRejectedError,
  PublishPendingEventsService,
  type EventPublisher,
  type OutboxFailure,
  type OutboxStore,
  type PendingOutboxMessage,
} from '../../../src/application/index.js';
import { NOW } from '../../support/entry-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { ImmediateTransactionRunner } from '../../support/immediate-transaction-runner.js';

const message = (id: string, attempts = 0): PendingOutboxMessage => ({
  id,
  type: 'cashflow.ledger.entry.recorded.v1',
  body: { id },
  attempts,
});

class FakeOutbox implements OutboxStore {
  readonly published = new Map<string, Date>();
  readonly failures: OutboxFailure[] = [];
  lockedWith: { limit: number; now: Date } | null = null;

  constructor(private readonly pending: readonly PendingOutboxMessage[]) {}

  async lockPending(limit: number, now: Date): Promise<readonly PendingOutboxMessage[]> {
    this.lockedWith = { limit, now };
    return this.pending.slice(0, limit);
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    ids.forEach((id) => this.published.set(id, publishedAt));
  }

  async recordFailures(failures: readonly OutboxFailure[]): Promise<void> {
    this.failures.push(...failures);
  }
}

class FakePublisher implements EventPublisher {
  readonly sent: string[] = [];

  constructor(private readonly failures: Readonly<Record<string, Error>> = {}) {}

  async publish(pending: PendingOutboxMessage): Promise<void> {
    const failure = this.failures[pending.id];
    if (failure !== undefined) {
      throw failure;
    }
    this.sent.push(pending.id);
  }
}

const serviceWith = (outbox: OutboxStore, publisher: EventPublisher) =>
  new PublishPendingEventsService({
    outbox,
    publisher,
    transactions: new ImmediateTransactionRunner(),
    clock: new FixedClock(NOW),
    batchSize: 3,
    retryBackoff: { baseDelayMs: 1_000, maxDelayMs: 60_000 },
  });

describe('PublishPendingEventsService', () => {
  it('publishes a batch of due messages and marks them as published', async () => {
    const outbox = new FakeOutbox([message('a'), message('b'), message('c'), message('d')]);
    const publisher = new FakePublisher();

    const report = await serviceWith(outbox, publisher).execute();

    expect(report).toEqual({ published: 3, rejected: [] });
    expect(outbox.lockedWith).toEqual({ limit: 3, now: NOW });
    expect(publisher.sent.sort()).toEqual(['a', 'b', 'c']);
    expect([...outbox.published.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('does nothing when there are no due messages', async () => {
    const outbox = new FakeOutbox([]);

    expect(await serviceWith(outbox, new FakePublisher()).execute()).toEqual({
      published: 0,
      rejected: [],
    });
  });

  it('isolates rejected messages and schedules them with exponential backoff', async () => {
    const outbox = new FakeOutbox([message('a'), message('b', 3), message('c')]);
    const publisher = new FakePublisher({ b: new MessageRejectedError('no bound queue') });

    const report = await serviceWith(outbox, publisher).execute();

    expect(report.published).toBe(2);
    expect(report.rejected).toEqual([
      {
        id: 'b',
        type: 'cashflow.ledger.entry.recorded.v1',
        reason: 'no bound queue',
        attempts: 4,
      },
    ]);
    expect([...outbox.published.keys()]).toEqual(['a', 'c']);
    expect(outbox.failures).toEqual([
      { id: 'b', reason: 'no bound queue', nextAttemptAt: new Date(NOW.getTime() + 8_000) },
    ]);
  });

  it('caps the retry delay', async () => {
    const outbox = new FakeOutbox([message('a', 20)]);
    const publisher = new FakePublisher({ a: new MessageRejectedError('no bound queue') });

    await serviceWith(outbox, publisher).execute();

    expect(outbox.failures[0]?.nextAttemptAt).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('fails the whole batch on infrastructure errors without penalizing messages', async () => {
    const outbox = new FakeOutbox([message('a'), message('b')]);
    const publisher = new FakePublisher({ b: new Error('channel closed') });

    await expect(serviceWith(outbox, publisher).execute()).rejects.toThrow('channel closed');
    expect(outbox.published.size).toBe(0);
    expect(outbox.failures).toEqual([]);
  });
});

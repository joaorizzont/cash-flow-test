import { randomUUID } from 'node:crypto';
import { isLedgerEventV1, LEDGER_EVENTS_EXCHANGE } from '@cash-flow/contracts';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { RabbitMqConnection } from '../../src/adapters/outbound/messaging/rabbitmq-connection.js';
import { RabbitMqEventPublisher } from '../../src/adapters/outbound/messaging/rabbitmq-event-publisher.js';
import { OutboxWriter } from '../../src/adapters/outbound/postgres/outbox-writer.js';
import { PostgresEntryRepository } from '../../src/adapters/outbound/postgres/postgres-entry-repository.js';
import { PostgresOutboxStore } from '../../src/adapters/outbound/postgres/postgres-outbox-store.js';
import { UuidV7Generator } from '../../src/adapters/outbound/system/uuid-v7-generator.js';
import { PublishPendingEventsService } from '../../src/application/index.js';
import { EntryId } from '../../src/domain/index.js';
import { NOW, recordedEntry } from '../support/entry-fixtures.js';
import { FixedClock } from '../support/fixed-clock.js';
import { collectFromExchange, type QueueCollector } from './support/queue-collector.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

const silentLogger = pino({ level: 'silent' });

describe('outbox relay with PostgreSQL and RabbitMQ', () => {
  let testDatabase: TestDatabase;
  let connection: RabbitMqConnection;
  let collector: QueueCollector;
  let repository: PostgresEntryRepository;
  const ids = new UuidV7Generator();
  const publishers: RabbitMqEventPublisher[] = [];

  const relayPublishingTo = (exchange: string, batchSize = 10): PublishPendingEventsService => {
    const publisher = new RabbitMqEventPublisher(connection, exchange);
    publishers.push(publisher);
    return new PublishPendingEventsService({
      outbox: new PostgresOutboxStore(testDatabase.database),
      publisher,
      transactions: testDatabase.database,
      clock: new FixedClock(NOW),
      batchSize,
      retryBackoff: { baseDelayMs: 1_000, maxDelayMs: 60_000 },
    });
  };

  const recordEntries = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      await repository.save(recordedEntry({ id: EntryId.from(ids.next()) }));
    }
  };

  const pendingCount = async (): Promise<number> => {
    const result = await testDatabase.pool.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM outbox WHERE published_at IS NULL',
    );
    return result.rows[0]?.total ?? 0;
  };

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    connection = await RabbitMqConnection.open(inject('rabbitMqUrl'), silentLogger);
    collector = await collectFromExchange(inject('rabbitMqUrl'), LEDGER_EVENTS_EXCHANGE);
    repository = new PostgresEntryRepository(
      testDatabase.database,
      new OutboxWriter(testDatabase.database, ids),
    );
  });

  afterAll(async () => {
    await Promise.all(publishers.map((publisher) => publisher.close()));
    await collector.close();
    await connection.close();
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  it('publishes pending events as CloudEvents and marks them as published', async () => {
    const received = collector.messages.length;
    await recordEntries(3);

    const report = await relayPublishingTo(LEDGER_EVENTS_EXCHANGE).execute();
    const messages = (await collector.waitFor(received + 3)).slice(received);

    expect(report).toEqual({ published: 3, rejected: [] });
    expect(await pendingCount()).toBe(0);
    for (const message of messages) {
      const body: unknown = JSON.parse(message.content.toString());
      expect(isLedgerEventV1(body)).toBe(true);
      expect(message.properties).toMatchObject({
        contentType: 'application/cloudevents+json',
        deliveryMode: 2,
        appId: 'ledger',
        type: 'cashflow.ledger.entry.recorded.v1',
      });
      expect(message.properties.messageId).toBe((body as { id: string }).id);
    }
  });

  it('keeps unroutable events pending with a retry schedule instead of blocking the outbox', async () => {
    await recordEntries(1);
    const relay = relayPublishingTo(`test.unbound.${randomUUID()}`);

    const report = await relay.execute();
    const result = await testDatabase.pool.query(
      'SELECT attempts, last_error, next_attempt_at, published_at FROM outbox',
    );

    expect(report.published).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      attempts: 1,
      last_error: expect.stringContaining('has no bound queue'),
      next_attempt_at: new Date(NOW.getTime() + 1_000),
      published_at: null,
    });
    expect(await relay.execute()).toEqual({ published: 0, rejected: [] });
  });

  it('keeps publishing other events when one of them is rejected', async () => {
    const received = collector.messages.length;
    await recordEntries(3);
    await testDatabase.pool.query(
      `UPDATE outbox SET event_type = 'cashflow.ledger.unknown.v1'
       WHERE id = (SELECT id FROM outbox ORDER BY occurred_at LIMIT 1)`,
    );

    const report = await relayPublishingTo(LEDGER_EVENTS_EXCHANGE).execute();
    await collector.waitFor(received + 2);

    expect(report.published).toBe(2);
    expect(report.rejected).toEqual([
      expect.objectContaining({ type: 'cashflow.ledger.unknown.v1', attempts: 1 }),
    ]);
    expect(await pendingCount()).toBe(1);
  });

  it('publishes each event once when several relays run concurrently', async () => {
    const received = collector.messages.length;
    await recordEntries(40);
    const relays = [1, 2, 3].map(() => relayPublishingTo(LEDGER_EVENTS_EXCHANGE, 5));

    const drain = async (relay: PublishPendingEventsService): Promise<void> => {
      while ((await relay.execute()).published > 0) {
        await Promise.resolve();
      }
    };
    await Promise.all(relays.map(drain));
    const messages = (await collector.waitFor(received + 40)).slice(received);

    const messageIds = messages.map((message) => message.properties.messageId);
    expect(messageIds).toHaveLength(40);
    expect(new Set(messageIds).size).toBe(40);
    expect(await pendingCount()).toBe(0);
  });
});

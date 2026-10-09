import { randomUUID } from 'node:crypto';
import { connect, type ChannelModel, type ConfirmChannel, type GetMessage } from 'amqplib';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { LedgerMessageHandler } from '../../src/adapters/inbound/messaging/ledger-message-handler.js';
import { RabbitMqDeadLetterRedriver } from '../../src/adapters/inbound/messaging/rabbitmq-dead-letter-redriver.js';
import { RabbitMqLedgerEventConsumer } from '../../src/adapters/inbound/messaging/rabbitmq-ledger-event-consumer.js';
import type { ConsumerTopology } from '../../src/adapters/outbound/messaging/consumer-topology.js';
import { RabbitMqConnection } from '../../src/adapters/outbound/messaging/rabbitmq-connection.js';
import { publishConfirmed } from '../../src/adapters/outbound/messaging/rabbitmq-publishing.js';
import { PostgresDailyBalanceRepository } from '../../src/adapters/outbound/postgres/postgres-daily-balance-repository.js';
import type { ConsolidateMovement } from '../../src/application/index.js';
import { BusinessDate, MerchantId, type DailyBalance } from '../../src/domain/index.js';
import {
  BUSINESS_DATE,
  entryRecordedEvent,
  entryReversedEvent,
  MERCHANT_ID,
} from '../support/fixtures.js';
import { createDailyBalanceUseCases } from '../../src/container.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';
import { waitUntil } from './support/wait-until.js';

const silentLogger = pino({ level: 'silent' });
const MAX_ATTEMPTS = 3;

const topologyFor = (suffix: string): ConsumerTopology => ({
  exchange: `test.ledger.events.${suffix}`,
  binding: 'cashflow.ledger.entry.*.v1',
  queue: `test.daily-balance.${suffix}`,
  retryQueue: `test.daily-balance.${suffix}.retry`,
  deadLetterExchange: `test.daily-balance.dead-letter.${suffix}`,
  deadLetterQueue: `test.daily-balance.${suffix}.dlq`,
});

class FlakyConsolidation implements ConsolidateMovement {
  calls = 0;

  constructor(
    private readonly target: ConsolidateMovement,
    private failuresLeft: number,
  ) {}

  async execute(command: Parameters<ConsolidateMovement['execute']>[0]) {
    this.calls += 1;
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('database temporarily unavailable');
    }
    return this.target.execute(command);
  }

  recover(): void {
    this.failuresLeft = 0;
  }
}

describe('ledger event consumer with RabbitMQ and PostgreSQL', () => {
  let testDatabase: TestDatabase;
  let connection: RabbitMqConnection;
  let publisherModel: ChannelModel;
  let publisherChannel: ConfirmChannel;
  let balances: PostgresDailyBalanceRepository;
  let topology: ConsumerTopology;
  let consumer: RabbitMqLedgerEventConsumer | undefined;

  const startConsumer = async (consolidate: ConsolidateMovement): Promise<void> => {
    consumer = new RabbitMqLedgerEventConsumer({
      connection,
      handler: new LedgerMessageHandler({ consolidate, maxAttempts: MAX_ATTEMPTS }),
      topology,
      prefetch: 10,
      retryDelayMs: 50,
      logger: silentLogger,
    });
    consumer.start();
    const started = consumer;
    await waitUntil(async () => started.isConsuming());
  };

  const publish = (body: unknown, routingKey = 'cashflow.ledger.entry.recorded.v1') =>
    publishConfirmed(publisherChannel, {
      exchange: topology.exchange,
      routingKey,
      content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      options: { persistent: true, messageId: randomUUID() },
    });

  const dailyBalance = (): Promise<DailyBalance | null> =>
    balances.find(MerchantId.from(MERCHANT_ID), BusinessDate.from(BUSINESS_DATE));

  const waitForEntryCount = (count: number) =>
    waitUntil(async () => (await dailyBalance())?.entryCount === count);

  const messageCount = async (queue: string): Promise<number> =>
    (await publisherChannel.checkQueue(queue)).messageCount;

  const takeDeadLetter = async (): Promise<GetMessage> => {
    let message: GetMessage | false = false;
    await waitUntil(async () => {
      message = await publisherChannel.get(topology.deadLetterQueue, { noAck: true });
      return message !== false;
    });
    return message as unknown as GetMessage;
  };

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    balances = new PostgresDailyBalanceRepository(testDatabase.database);
    connection = await RabbitMqConnection.open(inject('rabbitMqUrl'), silentLogger);
    publisherModel = await connect(inject('rabbitMqUrl'));
    publisherChannel = await publisherModel.createConfirmChannel();
  });

  afterAll(async () => {
    await publisherModel.close();
    await connection.close();
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
    topology = topologyFor(randomUUID());
  });

  afterEach(async () => {
    await consumer?.stop();
    consumer = undefined;
  });

  it('consolidates recorded and reversed entries', async () => {
    await startConsumer(createDailyBalanceUseCases(testDatabase.database).consolidateMovement);
    const sale = entryRecordedEvent({ amountInCents: 15_000 });

    await publish(sale);
    await publish(entryRecordedEvent({ entryType: 'DEBIT', amountInCents: 2_000 }));
    const reversal = entryReversedEvent(sale.data.entryId);
    await publish(
      { ...reversal, data: { ...reversal.data, amountInCents: 15_000 } },
      'cashflow.ledger.entry.reversed.v1',
    );
    await waitForEntryCount(3);

    expect(await dailyBalance()).toMatchObject({
      totalCreditsInCents: 15_000,
      totalDebitsInCents: 17_000,
      balanceInCents: -2_000,
    });
    await waitUntil(async () => (await messageCount(topology.queue)) === 0);
  });

  it('counts a redelivered event once', async () => {
    await startConsumer(createDailyBalanceUseCases(testDatabase.database).consolidateMovement);
    const event = entryRecordedEvent({ amountInCents: 500 });

    await Promise.all([publish(event), publish(event), publish(event)]);
    await publish(entryRecordedEvent({ amountInCents: 1 }));
    await waitForEntryCount(2);

    expect(await dailyBalance()).toMatchObject({ totalCreditsInCents: 501, entryCount: 2 });
  });

  it('dead-letters an invalid message without retrying', async () => {
    const consolidation = new FlakyConsolidation(
      createDailyBalanceUseCases(testDatabase.database).consolidateMovement,
      0,
    );
    await startConsumer(consolidation);

    await publish('{not json');
    const deadLetter = await takeDeadLetter();

    expect(deadLetter.properties.headers).toMatchObject({
      'x-attempt': 1,
      'x-dead-letter-reason': 'Message body is not valid JSON',
    });
    expect(consolidation.calls).toBe(0);
  });

  it('retries a transient failure through the retry queue', async () => {
    const consolidation = new FlakyConsolidation(
      createDailyBalanceUseCases(testDatabase.database).consolidateMovement,
      MAX_ATTEMPTS - 1,
    );
    await startConsumer(consolidation);

    await publish(entryRecordedEvent({ amountInCents: 700 }));
    await waitForEntryCount(1);

    expect(consolidation.calls).toBe(MAX_ATTEMPTS);
    expect(await messageCount(topology.deadLetterQueue)).toBe(0);
  });

  it('dead-letters after exhausting the attempts and redrives it later', async () => {
    const consolidation = new FlakyConsolidation(
      createDailyBalanceUseCases(testDatabase.database).consolidateMovement,
      Number.POSITIVE_INFINITY,
    );
    await startConsumer(consolidation);
    const event = entryRecordedEvent({ amountInCents: 900 });

    await publish(event);
    await waitUntil(async () => (await messageCount(topology.deadLetterQueue)) === 1);
    const inspected = await publisherChannel.get(topology.deadLetterQueue, { noAck: false });
    if (inspected !== false) {
      expect(inspected.properties.headers).toMatchObject({
        'x-attempt': MAX_ATTEMPTS,
        'x-dead-letter-reason': 'Gave up after 3 attempts: database temporarily unavailable',
      });
      publisherChannel.nack(inspected, false, true);
    }
    consolidation.recover();

    const moved = await new RabbitMqDeadLetterRedriver(connection, topology).redrive(10);
    await waitForEntryCount(1);

    expect(moved).toBe(1);
    expect(await dailyBalance()).toMatchObject({ totalCreditsInCents: 900 });
    expect(await messageCount(topology.deadLetterQueue)).toBe(0);
  });
});

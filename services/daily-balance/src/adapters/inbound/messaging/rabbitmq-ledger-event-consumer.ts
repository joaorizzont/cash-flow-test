import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { Logger } from 'pino';
import {
  assertConsumerTopology,
  type ConsumerTopology,
} from '../../outbound/messaging/consumer-topology.js';
import type { RabbitMqConnection } from '../../outbound/messaging/rabbitmq-connection.js';
import { publishConfirmed } from '../../outbound/messaging/rabbitmq-publishing.js';
import {
  ATTEMPT_HEADER,
  attemptOf,
  DEAD_LETTER_REASON_HEADER,
  LAST_ERROR_HEADER,
  republishOptionsOf,
} from './delivery-headers.js';
import { ConsumerMetrics } from './consumer-metrics.js';
import type { HandlingOutcome, LedgerMessageHandler } from './ledger-message-handler.js';

export interface LedgerEventConsumerOptions {
  readonly connection: RabbitMqConnection;
  readonly handler: LedgerMessageHandler;
  readonly topology: ConsumerTopology;
  readonly prefetch: number;
  readonly retryDelayMs: number;
  readonly logger: Logger;
  readonly metrics?: ConsumerMetrics;
}

const RESUBSCRIBE_DELAY_MS = 1_000;

interface Delivery {
  readonly channel: ConfirmChannel;
  readonly message: ConsumeMessage;
  readonly attempt: number;
}

export class RabbitMqLedgerEventConsumer {
  private channel: ConfirmChannel | null = null;
  private consumerTag: string | null = null;
  private subscription: Promise<void> | null = null;
  private stopped = false;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly metrics: ConsumerMetrics;

  constructor(private readonly options: LedgerEventConsumerOptions) {
    this.metrics = options.metrics ?? new ConsumerMetrics();
  }

  start(): void {
    this.resubscribe();
  }

  isConsuming(): boolean {
    return this.consumerTag !== null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.subscription;
    const { channel, consumerTag } = this;
    if (channel !== null && consumerTag !== null) {
      await channel.cancel(consumerTag).catch(() => undefined);
    }
    await Promise.allSettled([...this.inFlight]);
    await channel?.close().catch(() => undefined);
  }

  private resubscribe(): void {
    if (this.stopped || this.subscription !== null || this.channel !== null) {
      return;
    }
    this.subscription = this.subscribe().finally(() => {
      this.subscription = null;
    });
  }

  private scheduleResubscribe(): void {
    setTimeout(() => this.resubscribe(), RESUBSCRIBE_DELAY_MS).unref();
  }

  private async subscribe(): Promise<void> {
    const { connection, topology, prefetch, logger } = this.options;
    try {
      const channel = await connection.model.createConfirmChannel();
      channel.on('close', () => this.onChannelClosed(channel));
      channel.on('error', (error: Error) => logger.warn({ err: error }, 'consumer channel error'));
      await channel.prefetch(prefetch);
      await assertConsumerTopology(channel, topology);
      this.channel = channel;
      const { consumerTag } = await channel.consume(topology.queue, (message) =>
        this.track(channel, message),
      );
      this.consumerTag = consumerTag;
      logger.info({ queue: topology.queue, prefetch }, 'consuming ledger events');
    } catch (error) {
      logger.error({ err: error }, 'failed to subscribe to ledger events');
      this.scheduleResubscribe();
    }
  }

  private onChannelClosed(channel: ConfirmChannel): void {
    if (this.channel !== channel) {
      return;
    }
    this.channel = null;
    this.consumerTag = null;
    if (!this.stopped) {
      this.options.logger.warn('consumer channel closed, resubscribing');
      this.scheduleResubscribe();
    }
  }

  private track(channel: ConfirmChannel, message: ConsumeMessage | null): void {
    if (message === null) {
      this.options.logger.warn('consumer cancelled by the broker');
      void channel.close().catch(() => undefined);
      return;
    }
    const delivery = { channel, message, attempt: attemptOf(message.properties) };
    const processing = this.process(delivery)
      .catch((error: unknown) => {
        this.options.logger.error({ err: error }, 'failed to settle ledger event');
      })
      .finally(() => this.inFlight.delete(processing));
    this.inFlight.add(processing);
  }

  private async process(delivery: Delivery): Promise<void> {
    const outcome = await this.options.handler.handle({
      content: delivery.message.content,
      attempt: delivery.attempt,
    });
    await this.settle(delivery, outcome);
    this.metrics.record(outcome);
  }

  private async settle(delivery: Delivery, outcome: HandlingOutcome): Promise<void> {
    const { logger } = this.options;
    const messageId: unknown = delivery.message.properties.messageId;
    switch (outcome.action) {
      case 'ack':
        delivery.channel.ack(delivery.message);
        logger.debug({ eventId: outcome.eventId, result: outcome.result }, 'ledger event consumed');
        return;
      case 'retry':
        await this.retryLater(delivery, outcome.reason);
        logger.warn({ messageId, attempt: delivery.attempt, reason: outcome.reason }, 'retrying');
        return;
      case 'dead-letter':
        await this.deadLetter(delivery, outcome.reason);
        logger.error({ messageId, reason: outcome.reason }, 'ledger event dead-lettered');
        return;
    }
  }

  private async retryLater(delivery: Delivery, reason: string): Promise<void> {
    const { channel, message, attempt } = delivery;
    await publishConfirmed(channel, {
      exchange: '',
      routingKey: this.options.topology.retryQueue,
      content: message.content,
      options: {
        ...republishOptionsOf(message.properties, {
          [ATTEMPT_HEADER]: attempt + 1,
          [LAST_ERROR_HEADER]: reason,
        }),
        expiration: String(this.options.retryDelayMs),
      },
    });
    channel.ack(message);
  }

  private async deadLetter(delivery: Delivery, reason: string): Promise<void> {
    const { channel, message, attempt } = delivery;
    const { deadLetterExchange, deadLetterQueue } = this.options.topology;
    await publishConfirmed(channel, {
      exchange: deadLetterExchange,
      routingKey: deadLetterQueue,
      content: message.content,
      options: republishOptionsOf(message.properties, {
        [ATTEMPT_HEADER]: attempt,
        [DEAD_LETTER_REASON_HEADER]: reason,
      }),
    });
    channel.ack(message);
  }
}

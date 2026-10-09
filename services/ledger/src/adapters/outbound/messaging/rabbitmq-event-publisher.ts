import { CLOUD_EVENTS_CONTENT_TYPE } from '@cash-flow/contracts';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { EventPublisher, PendingOutboxMessage } from '../../../application/index.js';
import type { RabbitMqConnection } from './rabbitmq-connection.js';
import { UnroutableEventError } from './unroutable-event-error.js';

const APP_ID = 'ledger';

export class RabbitMqEventPublisher implements EventPublisher {
  private channel: Promise<ConfirmChannel> | null = null;
  private readonly returnedIds = new Set<string>();

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly exchange: string,
  ) {}

  async publish(message: PendingOutboxMessage): Promise<void> {
    const channel = await this.confirmChannel();
    await this.publishConfirmed(channel, message);
    if (this.returnedIds.delete(message.id)) {
      throw new UnroutableEventError(message.id, message.type);
    }
  }

  async close(): Promise<void> {
    const channel = await this.channel?.catch(() => null);
    this.channel = null;
    await channel?.close().catch(() => undefined);
  }

  private publishConfirmed(channel: ConfirmChannel, message: PendingOutboxMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      channel.publish(
        this.exchange,
        message.type,
        Buffer.from(JSON.stringify(message.body)),
        {
          persistent: true,
          mandatory: true,
          messageId: message.id,
          type: message.type,
          contentType: CLOUD_EVENTS_CONTENT_TYPE,
          appId: APP_ID,
        },
        (error: unknown) => (error ? reject(error) : resolve()),
      );
    });
  }

  private confirmChannel(): Promise<ConfirmChannel> {
    this.channel ??= this.openChannel();
    return this.channel;
  }

  private async openChannel(): Promise<ConfirmChannel> {
    try {
      const channel = await this.connection.model.createConfirmChannel();
      channel.on('return', (returned: ConsumeMessage) => {
        this.returnedIds.add(String(returned.properties.messageId));
      });
      channel.on('close', () => this.discardChannel());
      channel.on('error', () => this.discardChannel());
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      return channel;
    } catch (error) {
      this.discardChannel();
      throw error;
    }
  }

  private discardChannel(): void {
    this.channel = null;
  }
}

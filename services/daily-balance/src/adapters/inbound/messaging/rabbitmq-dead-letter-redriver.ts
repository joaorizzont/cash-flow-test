import type { ConfirmChannel } from 'amqplib';
import {
  assertConsumerTopology,
  type ConsumerTopology,
} from '../../outbound/messaging/consumer-topology.js';
import type { RabbitMqConnection } from '../../outbound/messaging/rabbitmq-connection.js';
import { publishConfirmed } from '../../outbound/messaging/rabbitmq-publishing.js';
import {
  ATTEMPT_HEADER,
  DEAD_LETTER_REASON_HEADER,
  LAST_ERROR_HEADER,
  republishOptionsOf,
} from './delivery-headers.js';

const RESET_HEADERS = {
  [ATTEMPT_HEADER]: 1,
  [LAST_ERROR_HEADER]: undefined,
  [DEAD_LETTER_REASON_HEADER]: undefined,
};

export class RabbitMqDeadLetterRedriver {
  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly topology: ConsumerTopology,
  ) {}

  async redrive(limit: number): Promise<number> {
    const channel = await this.connection.model.createConfirmChannel();
    try {
      await assertConsumerTopology(channel, this.topology);
      return await this.moveMessages(channel, limit);
    } finally {
      await channel.close().catch(() => undefined);
    }
  }

  private async moveMessages(channel: ConfirmChannel, limit: number): Promise<number> {
    let moved = 0;
    while (moved < limit) {
      const message = await channel.get(this.topology.deadLetterQueue, { noAck: false });
      if (message === false) {
        return moved;
      }
      await publishConfirmed(channel, {
        exchange: '',
        routingKey: this.topology.queue,
        content: message.content,
        options: republishOptionsOf(message.properties, RESET_HEADERS),
      });
      channel.ack(message);
      moved += 1;
    }
    return moved;
  }
}

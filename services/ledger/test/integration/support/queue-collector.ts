import { LEDGER_ENTRY_EVENTS_BINDING } from '@cash-flow/contracts';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';

export interface QueueCollector {
  readonly messages: readonly ConsumeMessage[];
  waitFor(count: number, timeoutMs?: number): Promise<readonly ConsumeMessage[]>;
  close(): Promise<void>;
}

const waitUntil = async (condition: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for messages');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

export const collectFromExchange = async (
  url: string,
  exchange: string,
): Promise<QueueCollector> => {
  const connection: ChannelModel = await connect(url);
  const channel: Channel = await connection.createChannel();
  await channel.assertExchange(exchange, 'topic', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, exchange, LEDGER_ENTRY_EVENTS_BINDING);
  const messages: ConsumeMessage[] = [];
  await channel.consume(
    queue,
    (message) => {
      if (message !== null) {
        messages.push(message);
      }
    },
    { noAck: true },
  );

  return {
    messages,
    waitFor: async (count, timeoutMs = 5_000) => {
      await waitUntil(() => messages.length >= count, timeoutMs);
      return messages;
    },
    close: () => connection.close(),
  };
};

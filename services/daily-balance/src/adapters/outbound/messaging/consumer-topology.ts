import { LEDGER_ENTRY_EVENTS_BINDING, LEDGER_EVENTS_EXCHANGE } from '@cash-flow/contracts';
import type { Channel } from 'amqplib';

export interface ConsumerTopology {
  readonly exchange: string;
  readonly binding: string;
  readonly queue: string;
  readonly retryQueue: string;
  readonly deadLetterExchange: string;
  readonly deadLetterQueue: string;
}

export const LEDGER_EVENTS_TOPOLOGY: ConsumerTopology = {
  exchange: LEDGER_EVENTS_EXCHANGE,
  binding: LEDGER_ENTRY_EVENTS_BINDING,
  queue: 'daily-balance.ledger-events',
  retryQueue: 'daily-balance.ledger-events.retry',
  deadLetterExchange: 'daily-balance.dead-letter',
  deadLetterQueue: 'daily-balance.ledger-events.dlq',
};

const QUORUM = { 'x-queue-type': 'quorum' } as const;

export const assertConsumerTopology = async (
  channel: Channel,
  topology: ConsumerTopology,
): Promise<void> => {
  await channel.assertExchange(topology.exchange, 'topic', { durable: true });
  await channel.assertExchange(topology.deadLetterExchange, 'direct', { durable: true });
  await channel.assertQueue(topology.queue, {
    durable: true,
    arguments: {
      ...QUORUM,
      'x-dead-letter-exchange': topology.deadLetterExchange,
      'x-dead-letter-routing-key': topology.deadLetterQueue,
    },
  });
  await channel.assertQueue(topology.retryQueue, {
    durable: true,
    arguments: {
      ...QUORUM,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': topology.queue,
      'x-dead-letter-strategy': 'at-least-once',
      'x-overflow': 'reject-publish',
    },
  });
  await channel.assertQueue(topology.deadLetterQueue, { durable: true, arguments: QUORUM });
  await channel.bindQueue(topology.queue, topology.exchange, topology.binding);
  await channel.bindQueue(
    topology.deadLetterQueue,
    topology.deadLetterExchange,
    topology.deadLetterQueue,
  );
};

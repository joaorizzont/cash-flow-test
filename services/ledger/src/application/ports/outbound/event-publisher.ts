import type { PendingOutboxMessage } from './outbox-store.js';

export class MessageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface EventPublisher {
  publish(message: PendingOutboxMessage): Promise<void>;
}

import { MessageRejectedError } from '../../../application/index.js';

export class UnroutableEventError extends MessageRejectedError {
  constructor(eventId: string, routingKey: string) {
    super(`Event ${eventId} with routing key ${routingKey} has no bound queue`);
  }
}

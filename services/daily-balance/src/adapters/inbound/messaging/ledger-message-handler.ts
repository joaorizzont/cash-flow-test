import {
  describeLedgerEventErrors,
  isLedgerEventV1,
  type LedgerEventV1,
} from '@cash-flow/contracts';
import type { ConsolidateMovement, ConsolidationResult } from '../../../application/index.js';
import { DomainError } from '../../../domain/index.js';
import { toConsolidateMovementCommand } from './ledger-event-translator.js';

export interface InboundMessage {
  readonly content: Buffer;
  readonly attempt: number;
}

export type HandlingOutcome =
  | {
      readonly action: 'ack';
      readonly eventId: string;
      readonly occurredAt: string;
      readonly result: ConsolidationResult;
    }
  | { readonly action: 'retry'; readonly reason: string }
  | { readonly action: 'dead-letter'; readonly reason: string };

export interface LedgerMessageHandlerOptions {
  readonly consolidate: ConsolidateMovement;
  readonly maxAttempts: number;
}

class InvalidMessageError extends Error {}

const MAX_REASON_LENGTH = 1_000;

const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, MAX_REASON_LENGTH);

const parseJson = (content: Buffer): unknown => {
  try {
    return JSON.parse(content.toString('utf8'));
  } catch {
    throw new InvalidMessageError('Message body is not valid JSON');
  }
};

const decode = (content: Buffer): LedgerEventV1 => {
  const body = parseJson(content);
  if (!isLedgerEventV1(body)) {
    const errors = describeLedgerEventErrors(body).join('; ');
    throw new InvalidMessageError(`Message does not match the ledger event contract: ${errors}`);
  }
  return body;
};

const isPermanent = (error: unknown): boolean =>
  error instanceof InvalidMessageError || error instanceof DomainError;

export class LedgerMessageHandler {
  constructor(private readonly options: LedgerMessageHandlerOptions) {}

  async handle(message: InboundMessage): Promise<HandlingOutcome> {
    try {
      const event = decode(message.content);
      const result = await this.options.consolidate.execute(toConsolidateMovementCommand(event));
      return { action: 'ack', eventId: event.id, occurredAt: event.time, result };
    } catch (error) {
      return this.outcomeOf(error, message.attempt);
    }
  }

  private outcomeOf(error: unknown, attempt: number): HandlingOutcome {
    const reason = reasonOf(error);
    if (isPermanent(error)) {
      return { action: 'dead-letter', reason };
    }
    if (attempt >= this.options.maxAttempts) {
      return { action: 'dead-letter', reason: `Gave up after ${attempt} attempts: ${reason}` };
    }
    return { action: 'retry', reason };
  }
}

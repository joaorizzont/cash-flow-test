import { describe, expect, it, vi } from 'vitest';
import { LedgerMessageHandler } from '../../../../src/adapters/inbound/messaging/ledger-message-handler.js';
import {
  ConsolidationResult,
  type ConsolidateMovement,
} from '../../../../src/application/index.js';
import { ValidationError } from '../../../../src/domain/index.js';
import { entryRecordedEvent } from '../../../support/fixtures.js';

const MAX_ATTEMPTS = 3;

const handlerWith = (execute: ConsolidateMovement['execute']) =>
  new LedgerMessageHandler({ consolidate: { execute }, maxAttempts: MAX_ATTEMPTS });

const messageOf = (body: unknown, attempt = 1) => ({
  content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  attempt,
});

describe('LedgerMessageHandler', () => {
  it('acknowledges a consolidated event', async () => {
    const execute = vi.fn().mockResolvedValue(ConsolidationResult.APPLIED);
    const event = entryRecordedEvent();

    const outcome = await handlerWith(execute).handle(messageOf(event));

    expect(outcome).toEqual({
      action: 'ack',
      eventId: event.id,
      occurredAt: event.time,
      result: 'APPLIED',
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ eventId: event.id }));
  });

  it('acknowledges a duplicate event', async () => {
    const handler = handlerWith(async () => ConsolidationResult.DUPLICATE);

    const outcome = await handler.handle(messageOf(entryRecordedEvent()));

    expect(outcome).toMatchObject({ action: 'ack', result: 'DUPLICATE' });
  });

  it('dead-letters a message that is not JSON', async () => {
    const execute = vi.fn();

    const outcome = await handlerWith(execute).handle(messageOf('{not json'));

    expect(outcome).toEqual({ action: 'dead-letter', reason: 'Message body is not valid JSON' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('dead-letters a message that breaks the contract', async () => {
    const event = entryRecordedEvent();
    const invalid = { ...event, data: { ...event.data, amountInCents: -1 } };

    const outcome = await handlerWith(vi.fn()).handle(messageOf(invalid));

    expect(outcome).toMatchObject({
      action: 'dead-letter',
      reason: expect.stringContaining('/data/amountInCents'),
    });
  });

  it('dead-letters a message rejected by the domain without retrying', async () => {
    const handler = handlerWith(async () => {
      throw new ValidationError('Invalid business date');
    });

    const outcome = await handler.handle(messageOf(entryRecordedEvent()));

    expect(outcome).toEqual({ action: 'dead-letter', reason: 'Invalid business date' });
  });

  it('retries a transient failure', async () => {
    const handler = handlerWith(async () => {
      throw new Error('connection terminated');
    });

    const outcome = await handler.handle(messageOf(entryRecordedEvent(), MAX_ATTEMPTS - 1));

    expect(outcome).toEqual({ action: 'retry', reason: 'connection terminated' });
  });

  it('dead-letters once the attempts are exhausted', async () => {
    const handler = handlerWith(async () => {
      throw new Error('connection terminated');
    });

    const outcome = await handler.handle(messageOf(entryRecordedEvent(), MAX_ATTEMPTS));

    expect(outcome).toEqual({
      action: 'dead-letter',
      reason: 'Gave up after 3 attempts: connection terminated',
    });
  });
});

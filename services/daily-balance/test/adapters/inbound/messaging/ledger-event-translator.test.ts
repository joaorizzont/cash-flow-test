import { describe, expect, it } from 'vitest';
import { toConsolidateMovementCommand } from '../../../../src/adapters/inbound/messaging/ledger-event-translator.js';
import { entryRecordedEvent, entryReversedEvent } from '../../../support/fixtures.js';

describe('toConsolidateMovementCommand', () => {
  it('translates a recorded entry into a movement command', () => {
    const event = entryRecordedEvent({ amountInCents: 15_990 });

    expect(toConsolidateMovementCommand(event)).toEqual({
      eventId: event.id,
      eventType: 'cashflow.ledger.entry.recorded.v1',
      occurredAt: new Date('2026-10-09T15:00:00.000Z'),
      entryId: event.data.entryId,
      merchantId: event.data.merchantId,
      businessDate: '2026-10-09',
      entryType: 'CREDIT',
      amountInCents: 15_990,
      currency: 'BRL',
    });
  });

  it('translates a reversal as a movement of its own type', () => {
    const event = entryReversedEvent(crypto.randomUUID());

    expect(toConsolidateMovementCommand(event)).toMatchObject({
      eventType: 'cashflow.ledger.entry.reversed.v1',
      entryId: event.data.entryId,
      entryType: 'DEBIT',
    });
  });
});

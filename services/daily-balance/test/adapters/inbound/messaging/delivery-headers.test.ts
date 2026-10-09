import type { MessageProperties } from 'amqplib';
import { describe, expect, it } from 'vitest';
import {
  attemptOf,
  republishOptionsOf,
} from '../../../../src/adapters/inbound/messaging/delivery-headers.js';

const propertiesWith = (headers: Record<string, unknown> | undefined): MessageProperties =>
  ({
    headers,
    messageId: 'event-1',
    type: 'cashflow.ledger.entry.recorded.v1',
    contentType: 'application/cloudevents+json',
    appId: 'ledger',
  }) as MessageProperties;

describe('attemptOf', () => {
  it('starts at the first attempt', () => {
    expect(attemptOf(propertiesWith(undefined))).toBe(1);
  });

  it('reads the attempt header', () => {
    expect(attemptOf(propertiesWith({ 'x-attempt': 3 }))).toBe(3);
  });

  it.each([0, -1, 'two', 1.5])('ignores an invalid attempt header %s', (value) => {
    expect(attemptOf(propertiesWith({ 'x-attempt': value }))).toBe(1);
  });
});

describe('republishOptionsOf', () => {
  it('keeps the message identity and merges the headers', () => {
    const options = republishOptionsOf(propertiesWith({ 'x-attempt': 1, other: 'kept' }), {
      'x-attempt': 2,
    });

    expect(options).toEqual({
      persistent: true,
      messageId: 'event-1',
      type: 'cashflow.ledger.entry.recorded.v1',
      contentType: 'application/cloudevents+json',
      appId: 'ledger',
      headers: { 'x-attempt': 2, other: 'kept' },
    });
  });
});

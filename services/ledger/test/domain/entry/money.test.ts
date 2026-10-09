import { describe, expect, it } from 'vitest';
import { Money, ValidationError } from '../../../src/domain/index.js';

describe('Money', () => {
  it('creates an amount in cents using BRL by default', () => {
    const money = Money.of(1_050);

    expect(money.cents).toBe(1_050);
    expect(money.currency).toBe('BRL');
  });

  it.each([0, -1, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects %s cents', (cents) => {
    expect(() => Money.of(cents)).toThrow(ValidationError);
  });

  it('rejects unsupported currencies', () => {
    expect(() => Money.of(100, 'USD')).toThrow('Unsupported currency: USD');
  });

  it('compares by value', () => {
    expect(Money.of(100).equals(Money.of(100))).toBe(true);
    expect(Money.of(100).equals(Money.of(200))).toBe(false);
  });
});

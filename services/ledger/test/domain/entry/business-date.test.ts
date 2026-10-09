import { describe, expect, it } from 'vitest';
import { BusinessDate, TimeZone, ValidationError } from '../../../src/domain/index.js';
import { SAO_PAULO } from '../../support/time-zones.js';

describe('BusinessDate', () => {
  it('accepts a valid ISO calendar date', () => {
    expect(BusinessDate.from('2028-02-29').value).toBe('2028-02-29');
  });

  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '09/10/2026', '2026-10-9', ''])(
    'rejects %j',
    (value) => {
      expect(() => BusinessDate.from(value)).toThrow(ValidationError);
    },
  );

  it('derives the date from an instant in the given time zone', () => {
    const lateNightInSaoPaulo = new Date('2026-10-09T02:30:00.000Z');

    expect(BusinessDate.fromInstant(lateNightInSaoPaulo, SAO_PAULO).value).toBe('2026-10-08');
    expect(BusinessDate.fromInstant(lateNightInSaoPaulo, TimeZone.from('UTC')).value).toBe(
      '2026-10-09',
    );
  });

  it('counts days between dates across months', () => {
    const start = BusinessDate.from('2026-09-25');
    const end = BusinessDate.from('2026-10-09');

    expect(start.daysUntil(end)).toBe(14);
    expect(end.daysUntil(start)).toBe(-14);
  });

  it('compares dates', () => {
    const earlier = BusinessDate.from('2026-10-08');
    const later = BusinessDate.from('2026-10-09');

    expect(later.isAfter(earlier)).toBe(true);
    expect(earlier.isAfter(later)).toBe(false);
    expect(earlier.equals(BusinessDate.from('2026-10-08'))).toBe(true);
  });
});

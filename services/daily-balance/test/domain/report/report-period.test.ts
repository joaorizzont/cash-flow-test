import { describe, expect, it } from 'vitest';
import { BusinessDate, ReportPeriod, ValidationError } from '../../../src/domain/index.js';

describe('ReportPeriod', () => {
  it('lists every day of the period, across month boundaries', () => {
    const period = ReportPeriod.parse('2026-02-27', '2026-03-02');

    expect(period.days().map((day) => day.value)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('accepts a single day', () => {
    expect(ReportPeriod.parse('2026-10-09', '2026-10-09').days()).toHaveLength(1);
  });

  it('rejects a start after the end', () => {
    expect(() => ReportPeriod.parse('2026-10-10', '2026-10-09')).toThrow(ValidationError);
  });

  it('accepts up to 92 days between the dates and rejects more', () => {
    const from = BusinessDate.from('2026-01-01');

    expect(() => ReportPeriod.of(from, from.addDays(92))).not.toThrow();
    expect(() => ReportPeriod.of(from, from.addDays(93))).toThrow(ValidationError);
  });

  it('rejects an invalid date', () => {
    expect(() => ReportPeriod.parse('2026-02-30', '2026-03-01')).toThrow(ValidationError);
  });
});

describe('BusinessDate arithmetic', () => {
  it('adds days across years', () => {
    expect(BusinessDate.from('2026-12-31').addDays(1).value).toBe('2027-01-01');
  });

  it('counts days between dates', () => {
    expect(BusinessDate.from('2026-10-01').daysUntil(BusinessDate.from('2026-10-09'))).toBe(8);
  });
});

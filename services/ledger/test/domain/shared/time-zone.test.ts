import { describe, expect, it } from 'vitest';
import { TimeZone, ValidationError } from '../../../src/domain/index.js';
import { MANAUS, NORONHA, RIO_BRANCO, SAO_PAULO } from '../../support/time-zones.js';

const LATE_NIGHT_IN_SAO_PAULO = new Date('2026-10-09T02:30:00.000Z');

describe('TimeZone', () => {
  it('canonicalizes IANA names', () => {
    expect(TimeZone.from('america/sao_paulo').value).toBe('America/Sao_Paulo');
    expect(TimeZone.from('UTC').value).toBe('UTC');
  });

  it.each(['', 'Mars/Olympus_Mons', '-03:00', '+02:00', 'GMT-3', 'America/'])(
    'rejects %j',
    (value) => {
      expect(() => TimeZone.from(value)).toThrow(ValidationError);
    },
  );

  it.each([
    [NORONHA, '2026-10-09'],
    [SAO_PAULO, '2026-10-08'],
    [MANAUS, '2026-10-08'],
    [RIO_BRANCO, '2026-10-08'],
  ])('derives the local date of the same instant in %s', (timeZone, expected) => {
    expect(timeZone.localDateOf(LATE_NIGHT_IN_SAO_PAULO)).toBe(expected);
  });

  it.each([
    [NORONHA, '2026-10-09T00:30:00-02:00'],
    [SAO_PAULO, '2026-10-08T23:30:00-03:00'],
    [MANAUS, '2026-10-08T22:30:00-04:00'],
    [RIO_BRANCO, '2026-10-08T21:30:00-05:00'],
    [TimeZone.from('UTC'), '2026-10-09T02:30:00+00:00'],
  ])('formats the local date time with offset in %s', (timeZone, expected) => {
    expect(timeZone.localDateTimeOf(LATE_NIGHT_IN_SAO_PAULO)).toBe(expected);
  });

  it('compares by canonical name', () => {
    expect(TimeZone.from('america/manaus').equals(MANAUS)).toBe(true);
    expect(MANAUS.equals(SAO_PAULO)).toBe(false);
    expect(MANAUS.toString()).toBe('America/Manaus');
  });
});

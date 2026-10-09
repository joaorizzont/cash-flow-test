import { describe, expect, it } from 'vitest';
import {
  BusinessDate,
  BusinessDateOutOfRangeError,
  BusinessDatePolicy,
  ValidationError,
} from '../../../src/domain/index.js';

const today = BusinessDate.from('2026-10-09');
const policy = new BusinessDatePolicy(30);

describe('BusinessDatePolicy', () => {
  it.each(['2026-10-09', '2026-10-01', '2026-09-09'])('accepts %s', (value) => {
    expect(() => policy.assertAcceptable(BusinessDate.from(value), today)).not.toThrow();
  });

  it.each(['2026-10-10', '2026-09-08'])('rejects %s', (value) => {
    expect(() => policy.assertAcceptable(BusinessDate.from(value), today)).toThrow(
      BusinessDateOutOfRangeError,
    );
  });

  it.each([-1, 1.5])('rejects %s as max backdated days', (value) => {
    expect(() => new BusinessDatePolicy(value)).toThrow(ValidationError);
  });
});

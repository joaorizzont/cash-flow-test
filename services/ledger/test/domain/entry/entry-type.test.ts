import { describe, expect, it } from 'vitest';
import {
  EntryType,
  oppositeOf,
  parseEntryType,
  ValidationError,
} from '../../../src/domain/index.js';

describe('EntryType', () => {
  it.each(['CREDIT', 'DEBIT'])('parses %s', (value) => {
    expect(parseEntryType(value)).toBe(value);
  });

  it.each(['credit', 'TRANSFER', ''])('rejects %j', (value) => {
    expect(() => parseEntryType(value)).toThrow(ValidationError);
  });

  it('returns the opposite type', () => {
    expect(oppositeOf(EntryType.CREDIT)).toBe(EntryType.DEBIT);
    expect(oppositeOf(EntryType.DEBIT)).toBe(EntryType.CREDIT);
  });
});

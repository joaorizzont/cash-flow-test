import { describe, expect, it } from 'vitest';
import { EntryId, MerchantId, ValidationError } from '../../../src/domain/index.js';
import { ENTRY_ID } from '../../support/entry-fixtures.js';

describe('identifiers', () => {
  it('normalizes UUIDs to lower case', () => {
    expect(EntryId.from(ENTRY_ID.toUpperCase()).value).toBe(ENTRY_ID);
  });

  it.each(['', 'not-a-uuid', '0b9f8e7d6c5b4a498382716051403928'])('rejects %j', (value) => {
    expect(() => MerchantId.from(value)).toThrow(ValidationError);
  });

  it('is equal only to identifiers of the same kind and value', () => {
    expect(EntryId.from(ENTRY_ID).equals(EntryId.from(ENTRY_ID))).toBe(true);
    expect(EntryId.from(ENTRY_ID).equals(MerchantId.from(ENTRY_ID))).toBe(false);
  });
});

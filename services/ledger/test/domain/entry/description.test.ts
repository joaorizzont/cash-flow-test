import { describe, expect, it } from 'vitest';
import { Description, DESCRIPTION_MAX_LENGTH, ValidationError } from '../../../src/domain/index.js';

describe('Description', () => {
  it('trims surrounding whitespace', () => {
    expect(Description.from('  Supplier payment  ').value).toBe('Supplier payment');
  });

  it('accepts the maximum length', () => {
    const text = 'a'.repeat(DESCRIPTION_MAX_LENGTH);

    expect(Description.from(text).value).toBe(text);
  });

  it.each(['', '   ', 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1)])('rejects %j', (value) => {
    expect(() => Description.from(value)).toThrow(ValidationError);
  });
});

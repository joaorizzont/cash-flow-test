import { Identifier } from '../shared/identifier.js';

export class EntryId extends Identifier {
  private constructor(value: string) {
    super(value, 'entry id');
  }

  static from(value: string): EntryId {
    return new EntryId(value);
  }
}

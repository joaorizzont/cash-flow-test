import { Identifier } from '../shared/identifier.js';

export class MerchantId extends Identifier {
  private constructor(value: string) {
    super(value, 'merchant id');
  }

  static from(value: string): MerchantId {
    return new MerchantId(value);
  }
}

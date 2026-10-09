import { Identifier } from '../shared/identifier.js';

export class PointOfSaleId extends Identifier {
  private constructor(value: string) {
    super(value, 'point of sale id');
  }

  static from(value: string): PointOfSaleId {
    return new PointOfSaleId(value);
  }
}

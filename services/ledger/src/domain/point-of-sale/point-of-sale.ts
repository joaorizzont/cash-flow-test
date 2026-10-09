import type { MerchantId } from '../shared/merchant-id.js';
import type { TimeZone } from '../shared/time-zone.js';
import type { PointOfSaleId } from './point-of-sale-id.js';

export interface PointOfSaleProps {
  readonly id: PointOfSaleId;
  readonly merchantId: MerchantId;
  readonly timeZone: TimeZone;
}

export class PointOfSale {
  private constructor(private props: PointOfSaleProps) {}

  static configure(props: PointOfSaleProps): PointOfSale {
    return new PointOfSale(props);
  }

  static restore(props: PointOfSaleProps): PointOfSale {
    return new PointOfSale(props);
  }

  changeTimeZone(timeZone: TimeZone): void {
    this.props = { ...this.props, timeZone };
  }

  get id(): PointOfSaleId {
    return this.props.id;
  }

  get merchantId(): MerchantId {
    return this.props.merchantId;
  }

  get timeZone(): TimeZone {
    return this.props.timeZone;
  }
}

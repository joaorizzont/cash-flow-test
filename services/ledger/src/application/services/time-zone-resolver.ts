import type { MerchantId, PointOfSaleId, TimeZone } from '../../domain/index.js';
import { PointOfSaleNotFoundError } from '../errors/point-of-sale-not-found-error.js';
import type { PointOfSaleRepository } from '../ports/outbound/point-of-sale-repository.js';

export class TimeZoneResolver {
  constructor(
    private readonly pointsOfSale: PointOfSaleRepository,
    private readonly defaultTimeZone: TimeZone,
  ) {}

  async resolve(merchantId: MerchantId, pointOfSaleId: PointOfSaleId | null): Promise<TimeZone> {
    if (pointOfSaleId === null) {
      return this.defaultTimeZone;
    }
    const pointOfSale = await this.pointsOfSale.findById(merchantId, pointOfSaleId);
    if (pointOfSale === null) {
      throw new PointOfSaleNotFoundError(pointOfSaleId.value);
    }
    return pointOfSale.timeZone;
  }
}

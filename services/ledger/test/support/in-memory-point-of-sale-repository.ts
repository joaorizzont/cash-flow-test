import type { PointOfSaleRepository } from '../../src/application/index.js';
import type { MerchantId, PointOfSale, PointOfSaleId } from '../../src/domain/index.js';

export class InMemoryPointOfSaleRepository implements PointOfSaleRepository {
  private readonly pointsOfSale = new Map<string, PointOfSale>();

  async save(pointOfSale: PointOfSale): Promise<void> {
    this.pointsOfSale.set(pointOfSale.id.value, pointOfSale);
  }

  async findById(merchantId: MerchantId, id: PointOfSaleId): Promise<PointOfSale | null> {
    const pointOfSale = this.pointsOfSale.get(id.value);
    return pointOfSale?.merchantId.equals(merchantId) === true ? pointOfSale : null;
  }

  size(): number {
    return this.pointsOfSale.size;
  }
}

import type { MerchantId, PointOfSale, PointOfSaleId } from '../../../domain/index.js';

export interface PointOfSaleRepository {
  save(pointOfSale: PointOfSale): Promise<void>;
  findById(merchantId: MerchantId, id: PointOfSaleId): Promise<PointOfSale | null>;
}

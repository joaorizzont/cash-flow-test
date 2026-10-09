import type { PointOfSaleRepository } from '../../../application/index.js';
import { MerchantId, PointOfSale, PointOfSaleId, TimeZone } from '../../../domain/index.js';
import type { Queryable } from './postgres-database.js';

interface PointOfSaleRow {
  readonly id: string;
  readonly merchant_id: string;
  readonly time_zone: string;
}

const toPointOfSale = (row: PointOfSaleRow): PointOfSale =>
  PointOfSale.restore({
    id: PointOfSaleId.from(row.id),
    merchantId: MerchantId.from(row.merchant_id),
    timeZone: TimeZone.from(row.time_zone),
  });

export class PostgresPointOfSaleRepository implements PointOfSaleRepository {
  constructor(private readonly database: Queryable) {}

  async save(pointOfSale: PointOfSale): Promise<void> {
    await this.database.query(
      `INSERT INTO points_of_sale (merchant_id, id, time_zone) VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id, id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now()`,
      [pointOfSale.merchantId.value, pointOfSale.id.value, pointOfSale.timeZone.value],
    );
  }

  async findById(merchantId: MerchantId, id: PointOfSaleId): Promise<PointOfSale | null> {
    const result = await this.database.query<PointOfSaleRow>(
      'SELECT id, merchant_id, time_zone FROM points_of_sale WHERE merchant_id = $1 AND id = $2',
      [merchantId.value, id.value],
    );
    const [row] = result.rows;
    return row === undefined ? null : toPointOfSale(row);
  }
}

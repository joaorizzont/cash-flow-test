import { MerchantId, PointOfSale, PointOfSaleId, TimeZone } from '../../domain/index.js';
import type {
  ConfigurePointOfSale,
  ConfigurePointOfSaleCommand,
  PointOfSaleView,
} from '../ports/inbound/configure-point-of-sale.js';
import type { PointOfSaleRepository } from '../ports/outbound/point-of-sale-repository.js';

const toPointOfSaleView = (pointOfSale: PointOfSale): PointOfSaleView => ({
  id: pointOfSale.id.value,
  merchantId: pointOfSale.merchantId.value,
  timeZone: pointOfSale.timeZone.value,
});

export class ConfigurePointOfSaleService implements ConfigurePointOfSale {
  constructor(private readonly repository: PointOfSaleRepository) {}

  async execute(command: ConfigurePointOfSaleCommand): Promise<PointOfSaleView> {
    const merchantId = MerchantId.from(command.merchantId);
    const id = PointOfSaleId.from(command.pointOfSaleId);
    const timeZone = TimeZone.from(command.timeZone);

    const existing = await this.repository.findById(merchantId, id);
    const pointOfSale = existing ?? PointOfSale.configure({ id, merchantId, timeZone });
    pointOfSale.changeTimeZone(timeZone);

    await this.repository.save(pointOfSale);
    return toPointOfSaleView(pointOfSale);
  }
}

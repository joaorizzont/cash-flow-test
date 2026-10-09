import { PostgresDailyBalanceReadModel } from '../../../src/adapters/outbound/postgres/postgres-daily-balance-read-model.js';
import type { Queryable } from '../../../src/adapters/outbound/postgres/postgres-database.js';
import {
  ReportPeriod,
  type BusinessDate,
  type DailyBalance,
  type MerchantId,
} from '../../../src/domain/index.js';

export const dailyBalanceOf = async (
  database: Queryable,
  merchantId: MerchantId,
  businessDate: BusinessDate,
): Promise<DailyBalance | null> => {
  const readModel = new PostgresDailyBalanceReadModel(database);
  const [balance] = await readModel.balancesIn(
    merchantId,
    ReportPeriod.of(businessDate, businessDate),
  );
  return balance ?? null;
};

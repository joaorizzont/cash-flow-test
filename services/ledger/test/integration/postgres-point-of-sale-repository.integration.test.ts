import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresPointOfSaleRepository } from '../../src/adapters/outbound/postgres/postgres-point-of-sale-repository.js';
import { MerchantId, PointOfSale, PointOfSaleId } from '../../src/domain/index.js';
import {
  MERCHANT_ID,
  OTHER_MERCHANT_ID,
  POINT_OF_SALE_ID,
  pointOfSaleIn,
} from '../support/entry-fixtures.js';
import { MANAUS, NORONHA } from '../support/time-zones.js';
import { connectTestDatabase, type TestDatabase } from './support/test-database.js';

describe('PostgresPointOfSaleRepository', () => {
  let testDatabase: TestDatabase;
  let repository: PostgresPointOfSaleRepository;
  const id = PointOfSaleId.from(POINT_OF_SALE_ID);

  beforeAll(async () => {
    testDatabase = await connectTestDatabase();
    repository = new PostgresPointOfSaleRepository(testDatabase.database);
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  it('creates and updates the time zone of a point of sale', async () => {
    const pointOfSale = pointOfSaleIn(MANAUS);
    await repository.save(pointOfSale);
    pointOfSale.changeTimeZone(NORONHA);

    await repository.save(pointOfSale);
    const restored = await repository.findById(MerchantId.from(MERCHANT_ID), id);

    expect(restored?.timeZone.equals(NORONHA)).toBe(true);
    expect(await testDatabase.count('points_of_sale')).toBe(1);
  });

  it('scopes points of sale by merchant', async () => {
    await repository.save(pointOfSaleIn(MANAUS));
    await repository.save(
      PointOfSale.configure({
        id,
        merchantId: MerchantId.from(OTHER_MERCHANT_ID),
        timeZone: NORONHA,
      }),
    );

    const own = await repository.findById(MerchantId.from(MERCHANT_ID), id);
    const other = await repository.findById(MerchantId.from(OTHER_MERCHANT_ID), id);

    expect(own?.timeZone.equals(MANAUS)).toBe(true);
    expect(other?.timeZone.equals(NORONHA)).toBe(true);
  });
});

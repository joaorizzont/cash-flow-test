import { beforeEach, describe, expect, it } from 'vitest';
import { PointOfSaleNotFoundError, TimeZoneResolver } from '../../../src/application/index.js';
import { MerchantId, PointOfSaleId } from '../../../src/domain/index.js';
import {
  MERCHANT_ID,
  OTHER_MERCHANT_ID,
  POINT_OF_SALE_ID,
  pointOfSaleIn,
} from '../../support/entry-fixtures.js';
import { InMemoryPointOfSaleRepository } from '../../support/in-memory-point-of-sale-repository.js';
import { MANAUS, SAO_PAULO } from '../../support/time-zones.js';

describe('TimeZoneResolver', () => {
  let resolver: TimeZoneResolver;

  beforeEach(async () => {
    const repository = new InMemoryPointOfSaleRepository();
    await repository.save(pointOfSaleIn(MANAUS));
    resolver = new TimeZoneResolver(repository, SAO_PAULO);
  });

  it('uses the point of sale time zone', async () => {
    const timeZone = await resolver.resolve(
      MerchantId.from(MERCHANT_ID),
      PointOfSaleId.from(POINT_OF_SALE_ID),
    );

    expect(timeZone.equals(MANAUS)).toBe(true);
  });

  it('falls back to the default time zone without a point of sale', async () => {
    const timeZone = await resolver.resolve(MerchantId.from(MERCHANT_ID), null);

    expect(timeZone.equals(SAO_PAULO)).toBe(true);
  });

  it('fails for a point of sale of another merchant', async () => {
    await expect(
      resolver.resolve(MerchantId.from(OTHER_MERCHANT_ID), PointOfSaleId.from(POINT_OF_SALE_ID)),
    ).rejects.toThrow(PointOfSaleNotFoundError);
  });
});

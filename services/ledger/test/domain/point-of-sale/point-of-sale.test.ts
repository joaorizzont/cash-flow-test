import { describe, expect, it } from 'vitest';
import { MERCHANT_ID, POINT_OF_SALE_ID, pointOfSaleIn } from '../../support/entry-fixtures.js';
import { MANAUS, SAO_PAULO } from '../../support/time-zones.js';

describe('PointOfSale', () => {
  it('is configured with its local time zone', () => {
    const pointOfSale = pointOfSaleIn(MANAUS);

    expect(pointOfSale.id.value).toBe(POINT_OF_SALE_ID);
    expect(pointOfSale.merchantId.value).toBe(MERCHANT_ID);
    expect(pointOfSale.timeZone.equals(MANAUS)).toBe(true);
  });

  it('changes its time zone', () => {
    const pointOfSale = pointOfSaleIn(MANAUS);

    pointOfSale.changeTimeZone(SAO_PAULO);

    expect(pointOfSale.timeZone.equals(SAO_PAULO)).toBe(true);
  });
});

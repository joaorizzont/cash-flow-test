import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigurePointOfSaleService } from '../../../src/application/index.js';
import { ValidationError } from '../../../src/domain/index.js';
import { MERCHANT_ID, POINT_OF_SALE_ID } from '../../support/entry-fixtures.js';
import { InMemoryPointOfSaleRepository } from '../../support/in-memory-point-of-sale-repository.js';

describe('ConfigurePointOfSaleService', () => {
  let repository: InMemoryPointOfSaleRepository;
  let service: ConfigurePointOfSaleService;

  beforeEach(() => {
    repository = new InMemoryPointOfSaleRepository();
    service = new ConfigurePointOfSaleService(repository);
  });

  it('creates a point of sale with its time zone', async () => {
    const view = await service.execute({
      merchantId: MERCHANT_ID,
      pointOfSaleId: POINT_OF_SALE_ID,
      timeZone: 'america/manaus',
    });

    expect(view).toEqual({
      id: POINT_OF_SALE_ID,
      merchantId: MERCHANT_ID,
      timeZone: 'America/Manaus',
    });
    expect(repository.size()).toBe(1);
  });

  it('updates the time zone of an existing point of sale', async () => {
    const command = { merchantId: MERCHANT_ID, pointOfSaleId: POINT_OF_SALE_ID };
    await service.execute({ ...command, timeZone: 'America/Manaus' });

    const view = await service.execute({ ...command, timeZone: 'America/Noronha' });

    expect(view.timeZone).toBe('America/Noronha');
    expect(repository.size()).toBe(1);
  });

  it('rejects an invalid time zone', async () => {
    await expect(
      service.execute({
        merchantId: MERCHANT_ID,
        pointOfSaleId: POINT_OF_SALE_ID,
        timeZone: '-03:00',
      }),
    ).rejects.toThrow(ValidationError);
    expect(repository.size()).toBe(0);
  });
});

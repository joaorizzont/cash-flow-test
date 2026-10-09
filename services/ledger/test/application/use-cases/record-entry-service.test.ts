import { beforeEach, describe, expect, it } from 'vitest';
import {
  PointOfSaleNotFoundError,
  RecordEntryService,
  TimeZoneResolver,
  type RecordEntryCommand,
} from '../../../src/application/index.js';
import {
  BusinessDateOutOfRangeError,
  BusinessDatePolicy,
  ValidationError,
} from '../../../src/domain/index.js';
import {
  MERCHANT_ID,
  NOW,
  POINT_OF_SALE_ID,
  pointOfSaleIn,
  TODAY,
} from '../../support/entry-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryEntryRepository } from '../../support/in-memory-entry-repository.js';
import { InMemoryPointOfSaleRepository } from '../../support/in-memory-point-of-sale-repository.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';
import { NORONHA, RIO_BRANCO, SAO_PAULO } from '../../support/time-zones.js';

const LATE_NIGHT_IN_SAO_PAULO = new Date('2026-10-09T02:30:00.000Z');
const RIO_BRANCO_POINT_OF_SALE_ID = '7b6a5948-3726-4150-9e8d-7c6b5a493827';

const command = (overrides: Partial<RecordEntryCommand> = {}): RecordEntryCommand => ({
  merchantId: MERCHANT_ID,
  type: 'DEBIT',
  amountInCents: 4_500,
  businessDate: TODAY,
  description: 'Office supplies',
  ...overrides,
});

describe('RecordEntryService', () => {
  let repository: InMemoryEntryRepository;
  let pointsOfSale: InMemoryPointOfSaleRepository;

  const serviceAt = (instant: Date): RecordEntryService =>
    new RecordEntryService({
      repository,
      clock: new FixedClock(instant),
      idGenerator: new SequentialIdGenerator(),
      businessDatePolicy: new BusinessDatePolicy(30),
      timeZoneResolver: new TimeZoneResolver(pointsOfSale, SAO_PAULO),
    });

  beforeEach(async () => {
    repository = new InMemoryEntryRepository();
    pointsOfSale = new InMemoryPointOfSaleRepository();
    await pointsOfSale.save(pointOfSaleIn(NORONHA));
    await pointsOfSale.save(pointOfSaleIn(RIO_BRANCO, RIO_BRANCO_POINT_OF_SALE_ID));
  });

  it('records the entry and returns its view', async () => {
    const view = await serviceAt(NOW).execute(command());

    expect(view).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      merchantId: MERCHANT_ID,
      pointOfSaleId: null,
      type: 'DEBIT',
      amountInCents: 4_500,
      currency: 'BRL',
      businessDate: TODAY,
      description: 'Office supplies',
      reversalOf: null,
      recordedAt: '2026-10-09T15:00:00.000Z',
      recordedAtLocal: '2026-10-09T12:00:00-03:00',
      timeZone: 'America/Sao_Paulo',
    });
    expect(repository.all()).toHaveLength(1);
  });

  it('keeps the EntryRecorded event on the saved aggregate for the outbox', async () => {
    await serviceAt(NOW).execute(command());

    const [saved] = repository.all();
    expect(saved?.pullDomainEvents()).toEqual([expect.objectContaining({ name: 'EntryRecorded' })]);
  });

  it('uses the point of sale time zone to accept a date that is already today there', async () => {
    const view = await serviceAt(LATE_NIGHT_IN_SAO_PAULO).execute(
      command({ pointOfSaleId: POINT_OF_SALE_ID, businessDate: '2026-10-09' }),
    );

    expect(view).toMatchObject({
      pointOfSaleId: POINT_OF_SALE_ID,
      businessDate: '2026-10-09',
      recordedAt: '2026-10-09T02:30:00.000Z',
      recordedAtLocal: '2026-10-09T00:30:00-02:00',
      timeZone: 'America/Noronha',
    });
  });

  it('rejects the same date as future in a point of sale still on the previous day', async () => {
    await expect(
      serviceAt(LATE_NIGHT_IN_SAO_PAULO).execute(
        command({ pointOfSaleId: RIO_BRANCO_POINT_OF_SALE_ID, businessDate: '2026-10-09' }),
      ),
    ).rejects.toThrow(BusinessDateOutOfRangeError);
  });

  it('defaults the business date to today in the resolved time zone', async () => {
    const service = serviceAt(LATE_NIGHT_IN_SAO_PAULO);

    const atNoronha = await service.execute(
      command({ pointOfSaleId: POINT_OF_SALE_ID, businessDate: undefined }),
    );
    const atDefault = await service.execute(command({ businessDate: undefined }));

    expect(atNoronha.businessDate).toBe('2026-10-09');
    expect(atDefault.businessDate).toBe('2026-10-08');
  });

  it('fails when the point of sale is not configured', async () => {
    await expect(
      serviceAt(NOW).execute(command({ pointOfSaleId: '5d4c3b2a-1908-4f7e-8d6c-5b4a39281706' })),
    ).rejects.toThrow(PointOfSaleNotFoundError);
    expect(repository.all()).toHaveLength(0);
  });

  it('rejects business dates outside the accepted window', async () => {
    await expect(serviceAt(NOW).execute(command({ businessDate: '2026-10-10' }))).rejects.toThrow(
      BusinessDateOutOfRangeError,
    );
    expect(repository.all()).toHaveLength(0);
  });

  it.each([
    { type: 'TRANSFER' },
    { amountInCents: 0 },
    { currency: 'USD' },
    { description: ' ' },
    { merchantId: 'merchant-1' },
    { pointOfSaleId: 'pos-1' },
  ])('rejects invalid input %j', async (overrides) => {
    await expect(serviceAt(NOW).execute(command(overrides))).rejects.toThrow(ValidationError);
    expect(repository.all()).toHaveLength(0);
  });
});

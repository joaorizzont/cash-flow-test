import { beforeEach, describe, expect, it } from 'vitest';
import { GetBalanceReportService } from '../../../src/application/index.js';
import { ValidationError } from '../../../src/domain/index.js';
import { dailyBalance, MERCHANT_ID, OTHER_MERCHANT_ID } from '../../support/fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryReadModel } from '../../support/in-memory-read-model.js';

describe('GetBalanceReportService', () => {
  let readModel: InMemoryReadModel;
  let service: GetBalanceReportService;

  beforeEach(() => {
    readModel = new InMemoryReadModel();
    service = new GetBalanceReportService({ readModel, clock: new FixedClock() });
  });

  it('builds the report with the balance accumulated before the period', async () => {
    readModel.add(
      dailyBalance('2026-09-30', { credits: 10_000, debits: 0 }),
      dailyBalance('2026-10-01', { credits: 0, debits: 2_500 }),
      dailyBalance('2026-10-02', { credits: 7_000, debits: 1_000, count: 4 }),
      dailyBalance('2026-10-02', { credits: 99_999, debits: 0 }, OTHER_MERCHANT_ID),
    );

    const { report, source } = await service.execute({
      merchantId: MERCHANT_ID,
      from: '2026-10-02',
      to: '2026-10-03',
    });

    expect(source).toBe('DATABASE');
    expect(report).toEqual({
      merchantId: MERCHANT_ID,
      from: '2026-10-02',
      to: '2026-10-03',
      openingBalanceInCents: 7_500,
      closingBalanceInCents: 13_500,
      totalCreditsInCents: 7_000,
      totalDebitsInCents: 1_000,
      netChangeInCents: 6_000,
      entryCount: 4,
      days: [
        {
          businessDate: '2026-10-02',
          totalCreditsInCents: 7_000,
          totalDebitsInCents: 1_000,
          balanceInCents: 6_000,
          entryCount: 4,
          openingBalanceInCents: 7_500,
          closingBalanceInCents: 13_500,
        },
        {
          businessDate: '2026-10-03',
          totalCreditsInCents: 0,
          totalDebitsInCents: 0,
          balanceInCents: 0,
          entryCount: 0,
          openingBalanceInCents: 13_500,
          closingBalanceInCents: 13_500,
        },
      ],
      generatedAt: '2026-10-09T15:00:00.000Z',
    });
  });

  it.each([
    { merchantId: 'merchant-1', from: '2026-10-01', to: '2026-10-01' },
    { merchantId: MERCHANT_ID, from: '2026-10-02', to: '2026-10-01' },
    { merchantId: MERCHANT_ID, from: '2026-01-01', to: '2026-12-31' },
  ])('rejects an invalid query %o', async (query) => {
    await expect(service.execute(query)).rejects.toThrow(ValidationError);
  });
});

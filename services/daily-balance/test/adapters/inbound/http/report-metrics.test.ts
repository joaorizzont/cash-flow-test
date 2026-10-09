import { describe, expect, it } from 'vitest';
import { ReportMetrics } from '../../../../src/adapters/inbound/http/report-metrics.js';
import { createTestMeter } from '../../../support/telemetry.js';

describe('ReportMetrics', () => {
  it('counts report responses by cache status', async () => {
    const telemetry = createTestMeter();
    const reportMetrics = new ReportMetrics(telemetry.provider.getMeter('test'));

    ['HIT', 'HIT', 'MISS', 'STALE'].forEach((status) => reportMetrics.record(status));

    const points = await telemetry.points('cashflow.balance_report.requests');
    expect(
      Object.fromEntries(points.map((point) => [point.attributes['cache'], point.value])),
    ).toEqual({ hit: 2, miss: 1, stale: 1 });
  });
});

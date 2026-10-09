import type { DataPoint, Histogram } from '@opentelemetry/sdk-metrics';
import { describe, expect, it } from 'vitest';
import { ConsumerMetrics } from '../../../../src/adapters/inbound/messaging/consumer-metrics.js';
import { createTestMeter } from '../../../support/telemetry.js';

const RECORDED_AT = '2026-10-09T15:00:00.000Z';

const valueByOutcome = (points: readonly DataPoint<unknown>[]) =>
  Object.fromEntries(points.map((point) => [point.attributes['outcome'], point.value]));

describe('ConsumerMetrics', () => {
  it('counts messages by outcome', async () => {
    const telemetry = createTestMeter();
    const consumerMetrics = new ConsumerMetrics(telemetry.provider.getMeter('test'));
    const ack = { action: 'ack', eventId: 'e', occurredAt: RECORDED_AT } as const;

    consumerMetrics.record({ ...ack, result: 'APPLIED' });
    consumerMetrics.record({ ...ack, result: 'APPLIED' });
    consumerMetrics.record({ ...ack, result: 'DUPLICATE' });
    consumerMetrics.record({ action: 'retry', reason: 'timeout' });
    consumerMetrics.record({ action: 'dead-letter', reason: 'invalid' });

    expect(valueByOutcome(await telemetry.points('cashflow.consumer.messages'))).toEqual({
      applied: 2,
      duplicate: 1,
      retry: 1,
      dead_letter: 1,
    });
  });

  it('measures the time from recording to consolidation of applied events only', async () => {
    const telemetry = createTestMeter();
    const consumerMetrics = new ConsumerMetrics(telemetry.provider.getMeter('test'));
    const ack = { action: 'ack', eventId: 'e', occurredAt: RECORDED_AT } as const;
    const now = new Date(Date.parse(RECORDED_AT) + 1_500);

    consumerMetrics.record({ ...ack, result: 'APPLIED' }, now);
    consumerMetrics.record({ ...ack, result: 'DUPLICATE' }, now);

    const [point] = (await telemetry.points(
      'cashflow.consolidation.lag',
    )) as DataPoint<Histogram>[];
    expect(point?.value).toMatchObject({ count: 1, sum: 1.5 });
  });
});

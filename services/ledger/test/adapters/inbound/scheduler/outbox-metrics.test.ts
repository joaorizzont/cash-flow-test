import { describe, expect, it } from 'vitest';
import { OutboxMetrics } from '../../../../src/adapters/inbound/scheduler/outbox-metrics.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { NOW } from '../../../support/entry-fixtures.js';
import { createTestMeter } from '../../../support/telemetry.js';

describe('OutboxMetrics', () => {
  it('counts published and rejected events', async () => {
    const telemetry = createTestMeter();
    const outboxMetrics = new OutboxMetrics(telemetry.provider.getMeter('test'));

    outboxMetrics.record({
      published: 3,
      rejected: [{ id: 'a', type: 'x', attempts: 1, reason: 'unroutable' }],
    });
    outboxMetrics.record({ published: 2, rejected: [] });

    expect((await telemetry.points('cashflow.outbox.published'))[0]?.value).toBe(5);
    expect((await telemetry.points('cashflow.outbox.rejected'))[0]?.value).toBe(1);
  });

  it('observes the backlog size and the age of the oldest pending event', async () => {
    const telemetry = createTestMeter();
    const outboxMetrics = new OutboxMetrics(telemetry.provider.getMeter('test'));
    const oldestOccurredAt = new Date(NOW.getTime() - 4_500);

    outboxMetrics.observeBacklog(
      async () => ({ pending: 7, oldestOccurredAt }),
      new FixedClock(NOW),
    );

    expect((await telemetry.points('cashflow.outbox.pending'))[0]?.value).toBe(7);
    expect((await telemetry.points('cashflow.outbox.lag'))[0]?.value).toBe(4.5);
  });

  it('reports no lag when nothing is pending', async () => {
    const telemetry = createTestMeter();
    const outboxMetrics = new OutboxMetrics(telemetry.provider.getMeter('test'));

    outboxMetrics.observeBacklog(
      async () => ({ pending: 0, oldestOccurredAt: null }),
      new FixedClock(NOW),
    );

    expect((await telemetry.points('cashflow.outbox.lag'))[0]?.value).toBe(0);
  });
});

import { metrics, type Counter, type Meter } from '@opentelemetry/api';
import type { Clock, PublicationReport } from '../../../application/index.js';
import type { OutboxBacklog } from '../../outbound/postgres/postgres-outbox-store.js';

const METER_NAME = 'cash-flow.ledger';

export class OutboxMetrics {
  private readonly published: Counter;
  private readonly rejected: Counter;

  constructor(private readonly meter: Meter = metrics.getMeter(METER_NAME)) {
    this.published = meter.createCounter('cashflow.outbox.published', {
      description: 'Events published to the broker',
      unit: '{event}',
    });
    this.rejected = meter.createCounter('cashflow.outbox.rejected', {
      description: 'Events rejected by the broker and scheduled for a retry',
      unit: '{event}',
    });
  }

  record(report: PublicationReport): void {
    this.published.add(report.published);
    this.rejected.add(report.rejected.length);
  }

  observeBacklog(readBacklog: () => Promise<OutboxBacklog>, clock: Clock): void {
    const pending = this.meter.createObservableGauge('cashflow.outbox.pending', {
      description: 'Events waiting to be published',
      unit: '{event}',
    });
    const lag = this.meter.createObservableGauge('cashflow.outbox.lag', {
      description: 'Age of the oldest event waiting to be published',
      unit: 's',
    });
    this.meter.addBatchObservableCallback(
      async (observer) => {
        const backlog = await readBacklog().catch(() => null);
        if (backlog === null) {
          return;
        }
        const oldest = backlog.oldestOccurredAt?.getTime() ?? clock.now().getTime();
        observer.observe(pending, backlog.pending);
        observer.observe(lag, Math.max(0, clock.now().getTime() - oldest) / 1_000);
      },
      [pending, lag],
    );
  }
}

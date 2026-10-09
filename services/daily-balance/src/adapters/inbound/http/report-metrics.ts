import { metrics, type Counter, type Meter } from '@opentelemetry/api';

const METER_NAME = 'cash-flow.daily-balance';

export class ReportMetrics {
  private readonly requests: Counter;

  constructor(meter: Meter = metrics.getMeter(METER_NAME)) {
    this.requests = meter.createCounter('cashflow.balance_report.requests', {
      description: 'Balance report responses by cache status',
      unit: '{request}',
    });
  }

  record(cacheStatus: string): void {
    this.requests.add(1, { cache: cacheStatus.toLowerCase() });
  }
}

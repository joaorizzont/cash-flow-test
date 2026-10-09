import { metrics, type Counter, type Meter } from '@opentelemetry/api';
import type { EntryView } from '../../../application/index.js';

const METER_NAME = 'cash-flow.ledger';

export class EntryMetrics {
  private readonly recorded: Counter;

  constructor(meter: Meter = metrics.getMeter(METER_NAME)) {
    this.recorded = meter.createCounter('cashflow.entries.recorded', {
      description: 'Entries recorded, including reversals',
      unit: '{entry}',
    });
  }

  record(entry: EntryView): void {
    this.recorded.add(1, { 'entry.type': entry.type, 'entry.reversal': entry.reversalOf !== null });
  }
}

import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';
import { ConsolidationResult } from '../../../application/index.js';
import type { HandlingOutcome } from './ledger-message-handler.js';

const METER_NAME = 'cash-flow.daily-balance';
const LAG_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900];

const outcomeLabel = (outcome: HandlingOutcome): string => {
  if (outcome.action !== 'ack') {
    return outcome.action === 'retry' ? 'retry' : 'dead_letter';
  }
  return outcome.result === ConsolidationResult.APPLIED ? 'applied' : 'duplicate';
};

export class ConsumerMetrics {
  private readonly messages: Counter;
  private readonly lag: Histogram;

  constructor(meter: Meter = metrics.getMeter(METER_NAME)) {
    this.messages = meter.createCounter('cashflow.consumer.messages', {
      description: 'Ledger events handled by the consumer, by outcome',
      unit: '{message}',
    });
    this.lag = meter.createHistogram('cashflow.consolidation.lag', {
      description: 'Time from the entry being recorded to its consolidation',
      unit: 's',
      advice: { explicitBucketBoundaries: LAG_BUCKETS_SECONDS },
    });
  }

  record(outcome: HandlingOutcome, now: Date = new Date()): void {
    this.messages.add(1, { outcome: outcomeLabel(outcome) });
    if (outcome.action === 'ack' && outcome.result === ConsolidationResult.APPLIED) {
      const lagMs = now.getTime() - Date.parse(outcome.occurredAt);
      this.lag.record(Math.max(0, lagMs) / 1_000);
    }
  }
}

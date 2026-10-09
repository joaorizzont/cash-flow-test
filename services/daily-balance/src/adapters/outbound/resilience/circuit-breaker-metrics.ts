import { metrics, type Counter, type Meter } from '@opentelemetry/api';
import { CircuitState, type CircuitBreaker } from './circuit-breaker.js';

const METER_NAME = 'cash-flow.daily-balance';

const STATE_VALUE: Readonly<Record<CircuitState, number>> = {
  [CircuitState.CLOSED]: 0,
  [CircuitState.HALF_OPEN]: 1,
  [CircuitState.OPEN]: 2,
};

export class CircuitBreakerMetrics {
  private readonly transitions: Counter;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(meter: Meter = metrics.getMeter(METER_NAME)) {
    this.transitions = meter.createCounter('cashflow.circuit_breaker.transitions', {
      description: 'Circuit breaker state changes',
      unit: '{transition}',
    });
    meter
      .createObservableGauge('cashflow.circuit_breaker.state', {
        description: 'Circuit breaker state: 0 closed, 1 half open, 2 open',
      })
      .addCallback((observer) => {
        for (const [circuit, breaker] of this.breakers) {
          observer.observe(STATE_VALUE[breaker.currentState], { circuit });
        }
      });
  }

  watch(circuit: string, breaker: CircuitBreaker): void {
    this.breakers.set(circuit, breaker);
  }

  transitioned(circuit: string, state: CircuitState): void {
    this.transitions.add(1, { circuit, state: state.toLowerCase() });
  }
}

import { describe, expect, it } from 'vitest';
import { CircuitBreakerMetrics } from '../../../../src/adapters/outbound/resilience/circuit-breaker-metrics.js';
import { CircuitBreaker } from '../../../../src/adapters/outbound/resilience/circuit-breaker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { createTestMeter } from '../../../support/telemetry.js';

describe('CircuitBreakerMetrics', () => {
  it('reports the current state of each circuit and counts transitions', async () => {
    const telemetry = createTestMeter();
    const breakerMetrics = new CircuitBreakerMetrics(telemetry.provider.getMeter('test'));
    const breaker = new CircuitBreaker({
      name: 'redis',
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
      callTimeoutMs: 50,
      clock: new FixedClock(),
      onStateChange: (circuit, state) => breakerMetrics.transitioned(circuit, state),
    });
    breakerMetrics.watch('redis', breaker);

    await breaker
      .execute(async () => {
        throw new Error('down');
      })
      .catch(() => undefined);

    const [state] = await telemetry.points('cashflow.circuit_breaker.state');
    const [transition] = await telemetry.points('cashflow.circuit_breaker.transitions');
    expect(state).toMatchObject({ value: 2, attributes: { circuit: 'redis' } });
    expect(transition).toMatchObject({ value: 1, attributes: { circuit: 'redis', state: 'open' } });
  });
});

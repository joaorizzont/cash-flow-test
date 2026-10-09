import { describe, expect, it, vi } from 'vitest';
import {
  CallTimeoutError,
  CircuitBreaker,
  CircuitOpenError,
} from '../../../../src/adapters/outbound/resilience/circuit-breaker.js';
import { FixedClock } from '../../../support/fixed-clock.js';

const RESET_TIMEOUT_MS = 10_000;

const setup = () => {
  const clock = new FixedClock();
  const transitions: string[] = [];
  const breaker = new CircuitBreaker({
    name: 'redis',
    failureThreshold: 3,
    resetTimeoutMs: RESET_TIMEOUT_MS,
    callTimeoutMs: 50,
    clock,
    onStateChange: (_name, state) => transitions.push(state),
  });
  return { clock, breaker, transitions };
};

const failing = async (): Promise<never> => {
  throw new Error('connection refused');
};

const trip = async (breaker: CircuitBreaker, times = 3): Promise<void> => {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await breaker.execute(failing).catch(() => undefined);
  }
};

describe('CircuitBreaker', () => {
  it('passes results through while closed', async () => {
    const { breaker } = setup();

    await expect(breaker.execute(async () => 'value')).resolves.toBe('value');
    expect(breaker.currentState).toBe('CLOSED');
  });

  it('opens after consecutive failures and rejects without calling the operation', async () => {
    const { breaker, transitions } = setup();
    await trip(breaker);
    const operation = vi.fn(async () => 'value');

    await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();
    expect(transitions).toEqual(['OPEN']);
  });

  it('resets the failure count after a success', async () => {
    const { breaker } = setup();
    await trip(breaker, 2);
    await breaker.execute(async () => 'value');
    await trip(breaker, 2);

    expect(breaker.currentState).toBe('CLOSED');
  });

  it('allows a single trial after the reset timeout and closes when it succeeds', async () => {
    const { breaker, clock, transitions } = setup();
    await trip(breaker);
    clock.advance(RESET_TIMEOUT_MS);

    let release: (value: string) => void = () => undefined;
    const trial = breaker.execute(() => new Promise<string>((resolve) => (release = resolve)));
    await expect(breaker.execute(async () => 'concurrent')).rejects.toThrow(CircuitOpenError);
    release('value');

    await expect(trial).resolves.toBe('value');
    expect(transitions).toEqual(['OPEN', 'HALF_OPEN', 'CLOSED']);
  });

  it('opens again when the trial fails', async () => {
    const { breaker, clock } = setup();
    await trip(breaker);
    clock.advance(RESET_TIMEOUT_MS);

    await breaker.execute(failing).catch(() => undefined);

    expect(breaker.currentState).toBe('OPEN');
    await expect(breaker.execute(async () => 'value')).rejects.toThrow(CircuitOpenError);
  });

  it('counts a slow call as a failure', async () => {
    const { breaker } = setup();
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));

    await expect(breaker.execute(slow)).rejects.toThrow(CallTimeoutError);
  });
});

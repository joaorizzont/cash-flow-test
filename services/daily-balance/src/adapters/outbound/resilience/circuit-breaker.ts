import type { Clock } from '../../../application/index.js';

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

export interface CircuitBreakerOptions {
  readonly name: string;
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly callTimeoutMs: number;
  readonly clock: Clock;
  readonly onStateChange?: (name: string, state: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit ${name} is open`);
    this.name = 'CircuitOpenError';
  }
}

export class CallTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`Call to ${name} timed out after ${timeoutMs} ms`);
    this.name = 'CallTimeoutError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private openedAt = 0;
  private trialInProgress = false;

  constructor(private readonly options: CircuitBreakerOptions) {}

  get currentState(): CircuitState {
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.admit();
    try {
      const result = await this.withTimeout(operation());
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private admit(): void {
    if (this.state === CircuitState.CLOSED) {
      return;
    }
    if (this.state === CircuitState.OPEN && this.resetTimeoutElapsed()) {
      this.transition(CircuitState.HALF_OPEN);
    }
    if (this.state === CircuitState.HALF_OPEN && !this.trialInProgress) {
      this.trialInProgress = true;
      return;
    }
    throw new CircuitOpenError(this.options.name);
  }

  private onSuccess(): void {
    this.trialInProgress = false;
    this.consecutiveFailures = 0;
    this.transition(CircuitState.CLOSED);
  }

  private onFailure(): void {
    this.trialInProgress = false;
    this.consecutiveFailures += 1;
    const tripped = this.consecutiveFailures >= this.options.failureThreshold;
    if (this.state === CircuitState.HALF_OPEN || tripped) {
      this.openedAt = this.now();
      this.transition(CircuitState.OPEN);
    }
  }

  private resetTimeoutElapsed(): boolean {
    return this.now() - this.openedAt >= this.options.resetTimeoutMs;
  }

  private transition(state: CircuitState): void {
    if (this.state !== state) {
      this.state = state;
      this.options.onStateChange?.(this.options.name, state);
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    const { name, callTimeoutMs } = this.options;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new CallTimeoutError(name, callTimeoutMs)), callTimeoutMs);
    });
    return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}

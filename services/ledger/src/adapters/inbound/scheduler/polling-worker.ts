import { setTimeout as sleep } from 'node:timers/promises';

export interface WorkerLogger {
  debug(context: object, message: string): void;
  error(context: object, message: string): void;
}

export interface PollingWorkerOptions {
  readonly name: string;
  readonly task: () => Promise<number>;
  readonly idleDelayMs: number;
  readonly maxBackoffMs: number;
  readonly logger: WorkerLogger;
}

interface Outcome {
  readonly processed: number;
  readonly failed: boolean;
}

export class PollingWorker {
  private readonly controller = new AbortController();
  private loop: Promise<void> | null = null;

  constructor(private readonly options: PollingWorkerOptions) {}

  start(): void {
    this.loop ??= this.run();
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await this.loop;
  }

  private async run(): Promise<void> {
    let consecutiveFailures = 0;
    while (!this.controller.signal.aborted) {
      const outcome = await this.runTask();
      consecutiveFailures = outcome.failed ? consecutiveFailures + 1 : 0;
      await this.pause(this.nextDelay(outcome, consecutiveFailures));
    }
  }

  private async runTask(): Promise<Outcome> {
    const { name, task, logger } = this.options;
    try {
      const processed = await task();
      if (processed > 0) {
        logger.debug({ worker: name, processed }, 'worker processed items');
      }
      return { processed, failed: false };
    } catch (error) {
      logger.error({ worker: name, err: error }, 'worker task failed');
      return { processed: 0, failed: true };
    }
  }

  private nextDelay(outcome: Outcome, consecutiveFailures: number): number {
    const { idleDelayMs, maxBackoffMs } = this.options;
    if (outcome.failed) {
      return Math.min(idleDelayMs * 2 ** consecutiveFailures, maxBackoffMs);
    }
    return outcome.processed > 0 ? 0 : idleDelayMs;
  }

  private async pause(milliseconds: number): Promise<void> {
    if (milliseconds === 0) {
      return;
    }
    await sleep(milliseconds, undefined, { signal: this.controller.signal }).catch(() => undefined);
  }
}

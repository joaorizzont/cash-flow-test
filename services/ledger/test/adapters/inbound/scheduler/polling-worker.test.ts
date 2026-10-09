import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PollingWorker,
  type WorkerLogger,
} from '../../../../src/adapters/inbound/scheduler/polling-worker.js';

const silentLogger: WorkerLogger = { debug: () => undefined, error: () => undefined };

describe('PollingWorker', () => {
  let worker: PollingWorker | undefined;

  afterEach(async () => {
    await worker?.stop();
  });

  const startWorker = (task: () => Promise<number>, logger = silentLogger): PollingWorker => {
    worker = new PollingWorker({
      name: 'test',
      task,
      idleDelayMs: 20,
      maxBackoffMs: 40,
      logger,
    });
    worker.start();
    return worker;
  };

  it('drains a backlog without waiting and then polls at the idle interval', async () => {
    const results = [5, 5, 0, 0];
    const task = vi.fn(async () => results.shift() ?? 0);

    startWorker(task);
    await sleep(30);

    expect(task.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(task.mock.calls.length).toBeLessThan(6);
  });

  it('keeps running after failures and logs them', async () => {
    const error = vi.fn();
    let calls = 0;
    const task = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('database unavailable');
      }
      return 0;
    });

    startWorker(task, { debug: () => undefined, error });
    await sleep(80);

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ worker: 'test', err: expect.any(Error) }),
      'worker task failed',
    );
    expect(task.mock.calls.length).toBeGreaterThan(1);
  });

  it('stops polling once stopped', async () => {
    const task = vi.fn(async () => 0);
    const running = startWorker(task);
    await sleep(10);

    await running.stop();
    const callsAfterStop = task.mock.calls.length;
    await sleep(50);

    expect(task.mock.calls.length).toBe(callsAfterStop);
  });
});

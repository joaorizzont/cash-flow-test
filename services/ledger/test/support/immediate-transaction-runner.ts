import type { TransactionRunner } from '../../src/application/index.js';

export class ImmediateTransactionRunner implements TransactionRunner {
  async run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

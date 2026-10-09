export interface PendingOutboxMessage {
  readonly id: string;
  readonly type: string;
  readonly body: unknown;
  readonly attempts: number;
}

export interface OutboxFailure {
  readonly id: string;
  readonly reason: string;
  readonly nextAttemptAt: Date;
}

export interface OutboxStore {
  lockPending(limit: number, now: Date): Promise<readonly PendingOutboxMessage[]>;
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;
  recordFailures(failures: readonly OutboxFailure[]): Promise<void>;
}

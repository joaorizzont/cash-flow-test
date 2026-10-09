export interface RetryBackoff {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

const MAX_REASON_LENGTH = 1_000;

export const nextAttemptAt = (now: Date, attempts: number, backoff: RetryBackoff): Date => {
  const delay = Math.min(backoff.baseDelayMs * 2 ** attempts, backoff.maxDelayMs);
  return new Date(now.getTime() + delay);
};

export const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, MAX_REASON_LENGTH);

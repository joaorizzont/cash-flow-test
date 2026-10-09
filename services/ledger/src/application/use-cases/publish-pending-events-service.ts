import type {
  PublicationReport,
  PublishPendingEvents,
  RejectedPublication,
} from '../ports/inbound/publish-pending-events.js';
import type { Clock } from '../ports/outbound/clock.js';
import { MessageRejectedError, type EventPublisher } from '../ports/outbound/event-publisher.js';
import type { OutboxStore, PendingOutboxMessage } from '../ports/outbound/outbox-store.js';
import type { TransactionRunner } from '../ports/outbound/transaction-runner.js';
import { nextAttemptAt, reasonOf, type RetryBackoff } from '../services/retry-backoff.js';

export interface PublishPendingEventsDependencies {
  readonly outbox: OutboxStore;
  readonly publisher: EventPublisher;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
  readonly batchSize: number;
  readonly retryBackoff: RetryBackoff;
}

interface Attempt {
  readonly message: PendingOutboxMessage;
  readonly result: PromiseSettledResult<void>;
}

const EMPTY_REPORT: PublicationReport = { published: 0, rejected: [] };

const rejectionOf = ({ message, result }: Attempt): RejectedPublication | null =>
  result.status === 'rejected'
    ? {
        id: message.id,
        type: message.type,
        reason: reasonOf(result.reason),
        attempts: message.attempts + 1,
      }
    : null;

const throwInfrastructureFailure = (attempts: readonly Attempt[]): void => {
  const failure = attempts.find(
    ({ result }) =>
      result.status === 'rejected' && !(result.reason instanceof MessageRejectedError),
  );
  if (failure?.result.status === 'rejected') {
    throw failure.result.reason;
  }
};

export class PublishPendingEventsService implements PublishPendingEvents {
  constructor(private readonly dependencies: PublishPendingEventsDependencies) {}

  async execute(): Promise<PublicationReport> {
    const { outbox, transactions, clock, batchSize } = this.dependencies;
    return transactions.run(async () => {
      const now = clock.now();
      const pending = await outbox.lockPending(batchSize, now);
      if (pending.length === 0) {
        return EMPTY_REPORT;
      }
      const attempts = await this.publishAll(pending);
      throwInfrastructureFailure(attempts);
      return this.settle(attempts, now);
    });
  }

  private async publishAll(pending: readonly PendingOutboxMessage[]): Promise<readonly Attempt[]> {
    const results = await Promise.allSettled(
      pending.map((message) => this.dependencies.publisher.publish(message)),
    );
    return pending.map((message, index) => ({
      message,
      result: results[index] ?? { status: 'fulfilled', value: undefined },
    }));
  }

  private async settle(attempts: readonly Attempt[], now: Date): Promise<PublicationReport> {
    const { outbox, retryBackoff } = this.dependencies;
    const publishedIds = attempts
      .filter(({ result }) => result.status === 'fulfilled')
      .map(({ message }) => message.id);
    const rejected = attempts
      .map(rejectionOf)
      .filter((rejection): rejection is RejectedPublication => rejection !== null);

    if (publishedIds.length > 0) {
      await outbox.markPublished(publishedIds, now);
    }
    if (rejected.length > 0) {
      await outbox.recordFailures(
        rejected.map((rejection) => ({
          id: rejection.id,
          reason: rejection.reason,
          nextAttemptAt: nextAttemptAt(now, rejection.attempts - 1, retryBackoff),
        })),
      );
    }
    return { published: publishedIds.length, rejected };
  }
}

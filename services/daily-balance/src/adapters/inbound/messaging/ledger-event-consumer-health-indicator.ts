import type { HealthIndicator } from '../../../application/index.js';
import type { RabbitMqLedgerEventConsumer } from './rabbitmq-ledger-event-consumer.js';

export class LedgerEventConsumerHealthIndicator implements HealthIndicator {
  readonly name = 'ledger-events-consumer';

  constructor(private readonly consumer: RabbitMqLedgerEventConsumer) {}

  async isHealthy(): Promise<boolean> {
    return this.consumer.isConsuming();
  }
}

import type { HealthIndicator } from '../../../application/index.js';
import type { RabbitMqConnection } from './rabbitmq-connection.js';

export class RabbitMqHealthIndicator implements HealthIndicator {
  readonly name = 'rabbitmq';

  constructor(private readonly connection: RabbitMqConnection) {}

  async isHealthy(): Promise<boolean> {
    return this.connection.isConnected();
  }
}

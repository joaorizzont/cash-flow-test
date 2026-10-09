import { connect, type RecoveringChannelModel } from 'amqplib';
import type { Logger } from 'pino';

const RECOVERY = {
  waitForConnect: false,
  initialDelay: 500,
  maxDelay: 30_000,
} as const;

export class RabbitMqConnection {
  private connected = false;

  private constructor(
    readonly model: RecoveringChannelModel,
    logger: Logger,
  ) {
    model.on('connect', () => {
      this.connected = true;
      logger.info('connected to rabbitmq');
    });
    model.on('disconnect', (error: Error) => {
      this.connected = false;
      logger.warn({ err: error }, 'disconnected from rabbitmq');
    });
    model.on('reconnect-scheduled', ({ attempt, delay }: { attempt: number; delay: number }) => {
      logger.warn({ attempt, delay }, 'rabbitmq reconnect scheduled');
    });
    model.on('error', (error: Error) => {
      logger.error({ err: error }, 'rabbitmq connection error');
    });
  }

  static async open(url: string, logger: Logger): Promise<RabbitMqConnection> {
    const model = await connect(url, { recovery: RECOVERY });
    return new RabbitMqConnection(model, logger);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    await this.model.close();
  }
}

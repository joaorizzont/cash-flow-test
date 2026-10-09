import { createClient } from 'redis';
import type { Logger } from 'pino';

const CONNECT_TIMEOUT_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

const reconnectDelay = (retries: number): number =>
  Math.min(100 * 2 ** retries, MAX_RECONNECT_DELAY_MS);

const createRedisClient = (url: string) =>
  createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: reconnectDelay },
  });

export type RedisClient = ReturnType<typeof createRedisClient>;

export class RedisConnection {
  private unavailableReported = false;

  private constructor(
    readonly client: RedisClient,
    private readonly logger: Logger,
  ) {
    client.on('ready', () => {
      this.unavailableReported = false;
      logger.info('connected to redis');
    });
    client.on('error', (error: Error) => this.reportUnavailable(error));
  }

  static open(url: string, logger: Logger): RedisConnection {
    const client = createRedisClient(url);
    const connection = new RedisConnection(client, logger);
    client.connect().catch((error: unknown) => connection.reportUnavailable(error));
    return connection;
  }

  isReady(): boolean {
    return this.client.isReady;
  }

  async close(): Promise<void> {
    if (this.client.isReady) {
      await this.client.close();
      return;
    }
    this.client.destroy();
  }

  private reportUnavailable(error: unknown): void {
    if (!this.unavailableReported) {
      this.unavailableReported = true;
      this.logger.warn({ err: error }, 'redis unavailable, serving reports without cache');
    }
  }
}

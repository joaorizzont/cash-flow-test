import { buildHttpServer } from './adapters/inbound/http/server.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();

const server = buildHttpServer({
  serviceName: env.SERVICE_NAME,
  logLevel: env.LOG_LEVEL,
  healthIndicators: [],
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, 'shutting down');
  await server.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

await server.listen({ host: '0.0.0.0', port: env.PORT });

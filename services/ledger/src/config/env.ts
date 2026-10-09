import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('ledger'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

const apiSchema = baseSchema.extend({
  DEFAULT_TIME_ZONE: z.string().default('America/Sao_Paulo'),
  MAX_BACKDATED_DAYS: z.coerce.number().int().nonnegative().default(30),
});

const relaySchema = baseSchema.extend({
  SERVICE_NAME: z.string().default('ledger-outbox-relay'),
  RABBITMQ_URL: z.string().min(1),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(1_000).default(100),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  OUTBOX_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(30_000),
  OUTBOX_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  OUTBOX_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(300_000),
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type RelayEnv = z.infer<typeof relaySchema>;

export const loadApiEnv = (source: NodeJS.ProcessEnv = process.env): ApiEnv =>
  apiSchema.parse(source);

export const loadRelayEnv = (source: NodeJS.ProcessEnv = process.env): RelayEnv =>
  relaySchema.parse(source);

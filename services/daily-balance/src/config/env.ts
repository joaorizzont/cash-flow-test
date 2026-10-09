import { z } from 'zod';

const logLevel = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

const processSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('daily-balance'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: logLevel,
});

const rabbitMqSchema = z.object({
  RABBITMQ_URL: z.string().min(1),
});

const apiSchema = processSchema.extend(databaseSchema.shape);

const consumerSchema = apiSchema.extend(rabbitMqSchema.shape).extend({
  SERVICE_NAME: z.string().default('daily-balance-consumer'),
  CONSUMER_PREFETCH: z.coerce.number().int().positive().max(1_000).default(20),
  CONSUMER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  CONSUMER_RETRY_DELAY_MS: z.coerce.number().int().positive().default(10_000),
});

const rebuildSchema = databaseSchema.extend({ LOG_LEVEL: logLevel });

const redriveSchema = rabbitMqSchema.extend({ LOG_LEVEL: logLevel });

export type ApiEnv = z.infer<typeof apiSchema>;
export type ConsumerEnv = z.infer<typeof consumerSchema>;
export type RebuildEnv = z.infer<typeof rebuildSchema>;
export type RedriveEnv = z.infer<typeof redriveSchema>;

export const loadApiEnv = (source: NodeJS.ProcessEnv = process.env): ApiEnv =>
  apiSchema.parse(source);

export const loadConsumerEnv = (source: NodeJS.ProcessEnv = process.env): ConsumerEnv =>
  consumerSchema.parse(source);

export const loadRebuildEnv = (source: NodeJS.ProcessEnv = process.env): RebuildEnv =>
  rebuildSchema.parse(source);

export const loadRedriveEnv = (source: NodeJS.ProcessEnv = process.env): RedriveEnv =>
  redriveSchema.parse(source);

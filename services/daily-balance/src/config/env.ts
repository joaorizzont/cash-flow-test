import { z } from 'zod';

const logLevel = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

const positiveInteger = z.coerce.number().int().positive();

const processSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInteger.default(3000),
  LOG_LEVEL: logLevel,
});

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: positiveInteger.default(10),
});

const rabbitMqSchema = z.object({
  RABBITMQ_URL: z.string().min(1),
});

const apiSchema = processSchema.extend(databaseSchema.shape).extend({
  SERVICE_NAME: z.string().default('daily-balance'),
  REDIS_URL: z.string().min(1),
  DATABASE_TIMEOUT_MS: positiveInteger.default(2_000),
  CACHE_FRESH_TTL_MS: positiveInteger.default(5_000),
  CACHE_STALE_TTL_SECONDS: positiveInteger.default(86_400),
  CACHE_TIMEOUT_MS: positiveInteger.default(100),
  CIRCUIT_FAILURE_THRESHOLD: positiveInteger.default(5),
  CIRCUIT_RESET_TIMEOUT_MS: positiveInteger.default(10_000),
});

const consumerSchema = processSchema
  .extend(databaseSchema.shape)
  .extend(rabbitMqSchema.shape)
  .extend({
    SERVICE_NAME: z.string().default('daily-balance-consumer'),
    CONSUMER_PREFETCH: positiveInteger.max(1_000).default(20),
    CONSUMER_MAX_ATTEMPTS: positiveInteger.default(5),
    CONSUMER_RETRY_DELAY_MS: positiveInteger.default(10_000),
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

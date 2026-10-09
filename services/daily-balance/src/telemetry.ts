import { register } from 'node:module';
import { metrics } from '@opentelemetry/api';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

const METRICS_EXPORT_INTERVAL_MS = 10_000;
const UNTRACED_PATHS = ['/health', '/docs'];

const isUntraced = (url: string | undefined): boolean =>
  UNTRACED_PATHS.some((path) => url?.startsWith(path) === true);

const startTelemetry = (): void => {
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: METRICS_EXPORT_INTERVAL_MS,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (request) => isUntraced(request.url) }),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: (route) => isUntraced(route.url),
      }),
      new PgInstrumentation({ requireParentSpan: true }),
      new RedisInstrumentation({ requireParentSpan: true }),
      new AmqplibInstrumentation(),
      new PinoInstrumentation(),
    ],
  });
  sdk.start();
  metrics
    .getMeter('cash-flow')
    .createObservableGauge('cashflow.service.up', {
      description: 'Always 1 while the process is running and exporting telemetry',
    })
    .addCallback((observer) => observer.observe(1));
  const shutdown = (): void => {
    void sdk.shutdown();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
};

if (process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] !== undefined) {
  startTelemetry();
}

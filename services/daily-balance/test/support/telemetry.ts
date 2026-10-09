import { context, propagation, trace, type Context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MeterProvider, MetricReader, type DataPoint } from '@opentelemetry/sdk-metrics';

class CollectingReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}
}

export interface TestMeter {
  readonly provider: MeterProvider;
  points(name: string): Promise<readonly DataPoint<unknown>[]>;
}

export const createTestMeter = (): TestMeter => {
  const reader = new CollectingReader();
  const provider = new MeterProvider({ readers: [reader] });
  return {
    provider,
    points: async (name) => {
      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((candidate) => candidate.descriptor.name === name);
      return (metric?.dataPoints ?? []) as readonly DataPoint<unknown>[];
    },
  };
};

export const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
export const SPAN_ID = '00f067aa0ba902b7';
export const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

export const enableTracePropagation = (): void => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
};

export const disableTracePropagation = (): void => {
  propagation.disable();
  context.disable();
};

export const sampledContext = (): Context =>
  trace.setSpanContext(context.active(), { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 });

import { context, propagation, ROOT_CONTEXT, type Context } from '@opentelemetry/api';

export interface TraceContextAttributes {
  readonly traceparent?: string;
  readonly tracestate?: string;
}

const isCarrier = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const traceContextOf = (active: Context = context.active()): TraceContextAttributes => {
  const carrier: Record<string, string> = {};
  propagation.inject(active, carrier);
  const { traceparent, tracestate } = carrier;
  return {
    ...(traceparent === undefined ? {} : { traceparent }),
    ...(tracestate === undefined ? {} : { tracestate }),
  };
};

export const contextFromEvent = (event: unknown): Context =>
  propagation.extract(ROOT_CONTEXT, isCarrier(event) ? event : {});

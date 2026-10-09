import { context, trace } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  contextFromEvent,
  traceContextOf,
} from '../../../../src/adapters/outbound/telemetry/trace-context.js';
import {
  disableTracePropagation,
  enableTracePropagation,
  sampledContext,
  SPAN_ID,
  TRACE_ID,
  TRACEPARENT,
} from '../../../support/telemetry.js';

describe('trace context of events', () => {
  beforeAll(enableTracePropagation);
  afterAll(disableTracePropagation);

  it('captures the active trace as CloudEvents tracing attributes', () => {
    const attributes = context.with(sampledContext(), () => traceContextOf());

    expect(attributes).toEqual({ traceparent: TRACEPARENT });
  });

  it('captures nothing outside a trace', () => {
    expect(traceContextOf()).toEqual({});
  });

  it('restores the trace of an event as the parent context', () => {
    const parent = trace.getSpanContext(
      contextFromEvent({ id: 'event', traceparent: TRACEPARENT }),
    );

    expect(parent).toMatchObject({ traceId: TRACE_ID, spanId: SPAN_ID, isRemote: true });
  });

  it('ignores events without trace attributes', () => {
    expect(trace.getSpanContext(contextFromEvent({ id: 'event' }))).toBeUndefined();
    expect(trace.getSpanContext(contextFromEvent('not an object'))).toBeUndefined();
  });
});

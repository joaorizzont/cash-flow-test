import { context } from '@opentelemetry/api';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activeTraceId,
  registerTraceHeaders,
} from '../../../../src/adapters/inbound/http/trace-headers.js';
import {
  disableTracePropagation,
  enableTracePropagation,
  sampledContext,
  TRACE_ID,
} from '../../../support/telemetry.js';

const responseWith = async (traceId: string | undefined) => {
  const app = Fastify();
  registerTraceHeaders(app, () => traceId);
  app.get('/', async () => ({ ok: true }));
  const response = await app.inject({ url: '/' });
  await app.close();
  return response;
};

describe('trace headers', () => {
  beforeAll(enableTracePropagation);
  afterAll(disableTracePropagation);

  it('exposes the trace id of the request so clients can report it', async () => {
    expect((await responseWith(TRACE_ID)).headers['x-trace-id']).toBe(TRACE_ID);
  });

  it('omits the header outside a trace', async () => {
    expect((await responseWith(undefined)).headers['x-trace-id']).toBeUndefined();
  });

  it('reads the trace id of the active span', () => {
    expect(context.with(sampledContext(), activeTraceId)).toBe(TRACE_ID);
    expect(activeTraceId()).toBeUndefined();
  });
});

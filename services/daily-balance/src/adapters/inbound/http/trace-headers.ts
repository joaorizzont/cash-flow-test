import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { FastifyInstance } from 'fastify';

export const TRACE_ID_HEADER = 'x-trace-id';

export const activeTraceId = (): string | undefined => {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext !== undefined && isSpanContextValid(spanContext)
    ? spanContext.traceId
    : undefined;
};

export const registerTraceHeaders = (
  app: FastifyInstance,
  traceIdOf: () => string | undefined = activeTraceId,
): void => {
  app.addHook('onSend', async (_request, reply) => {
    const traceId = traceIdOf();
    if (traceId !== undefined) {
      reply.header(TRACE_ID_HEADER, traceId);
    }
  });
};

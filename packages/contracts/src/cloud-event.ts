import { Type, type TSchema } from 'typebox';

export const CLOUD_EVENTS_SPEC_VERSION = '1.0';
export const CLOUD_EVENTS_CONTENT_TYPE = 'application/cloudevents+json';

const TRACEPARENT_PATTERN = '^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$';

export const TraceContextAttributes = {
  traceparent: Type.Optional(Type.String({ pattern: TRACEPARENT_PATTERN })),
  tracestate: Type.Optional(Type.String({ maxLength: 512 })),
};

export const cloudEventSchema = <TType extends string, TData extends TSchema>(
  type: TType,
  data: TData,
) =>
  Type.Object(
    {
      specversion: Type.Literal(CLOUD_EVENTS_SPEC_VERSION),
      id: Type.String({ format: 'uuid' }),
      source: Type.String({ minLength: 1 }),
      type: Type.Literal(type),
      subject: Type.String({ minLength: 1 }),
      time: Type.String({ format: 'date-time' }),
      datacontenttype: Type.Literal('application/json'),
      data,
      ...TraceContextAttributes,
    },
    { additionalProperties: false },
  );

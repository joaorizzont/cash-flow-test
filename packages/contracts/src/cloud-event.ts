import { Type, type TSchema } from 'typebox';

export const CLOUD_EVENTS_SPEC_VERSION = '1.0';
export const CLOUD_EVENTS_CONTENT_TYPE = 'application/cloudevents+json';

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
    },
    { additionalProperties: false },
  );

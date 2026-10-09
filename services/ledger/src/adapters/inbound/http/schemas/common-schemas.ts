import { Type } from 'typebox';

export const UuidSchema = Type.String({ format: 'uuid' });

export const MerchantHeadersSchema = Type.Object({
  'x-merchant-id': Type.String({ format: 'uuid', description: 'Merchant identifier' }),
});

export const IdempotentHeadersSchema = Type.Object({
  'x-merchant-id': Type.String({ format: 'uuid', description: 'Merchant identifier' }),
  'idempotency-key': Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 255,
      description: 'Unique key that makes retries of the same request safe',
    }),
  ),
});

export const ProblemSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.String(),
    code: Type.String(),
  },
  { $id: 'Problem' },
);

export const problemResponses = {
  400: Type.Ref('Problem'),
  404: Type.Ref('Problem'),
  409: Type.Ref('Problem'),
  422: Type.Ref('Problem'),
  500: Type.Ref('Problem'),
};

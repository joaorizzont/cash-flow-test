import { Type } from 'typebox';
import { DESCRIPTION_MAX_LENGTH } from '../../../../domain/index.js';
import { MAX_PAGE_SIZE } from '../../../../application/index.js';

export const EntryViewSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  merchantId: Type.String({ format: 'uuid' }),
  pointOfSaleId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  type: Type.Union([Type.Literal('CREDIT'), Type.Literal('DEBIT')]),
  amountInCents: Type.Integer(),
  currency: Type.Literal('BRL'),
  businessDate: Type.String({ format: 'date' }),
  description: Type.String(),
  reversalOf: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  recordedAt: Type.String({ format: 'date-time' }),
  recordedAtLocal: Type.String(),
  timeZone: Type.String(),
});

export const RecordEntryBodySchema = Type.Object(
  {
    type: Type.Union([Type.Literal('CREDIT'), Type.Literal('DEBIT')]),
    amountInCents: Type.Integer({ minimum: 1, description: 'Amount in cents' }),
    currency: Type.Optional(Type.Literal('BRL')),
    businessDate: Type.Optional(
      Type.String({
        format: 'date',
        description: 'Cash day of the entry. Defaults to today in the point of sale time zone',
      }),
    ),
    description: Type.String({ minLength: 1, maxLength: DESCRIPTION_MAX_LENGTH }),
    pointOfSaleId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

export const ReverseEntryBodySchema = Type.Object(
  {
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: DESCRIPTION_MAX_LENGTH })),
  },
  { additionalProperties: false },
);

export const EntryParamsSchema = Type.Object({
  entryId: Type.String({ format: 'uuid' }),
});

export const ListEntriesQuerySchema = Type.Object({
  from: Type.String({ format: 'date' }),
  to: Type.String({ format: 'date' }),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE })),
});

export const EntryListSchema = Type.Object({
  items: Type.Array(EntryViewSchema),
  page: Type.Integer(),
  pageSize: Type.Integer(),
  total: Type.Integer(),
});

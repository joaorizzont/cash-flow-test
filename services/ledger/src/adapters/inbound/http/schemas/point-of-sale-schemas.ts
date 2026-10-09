import { Type } from 'typebox';

export const PointOfSaleParamsSchema = Type.Object({
  pointOfSaleId: Type.String({ format: 'uuid' }),
});

export const ConfigurePointOfSaleBodySchema = Type.Object(
  {
    timeZone: Type.String({
      minLength: 1,
      description: 'IANA time zone name, for example America/Manaus',
    }),
  },
  { additionalProperties: false },
);

export const PointOfSaleViewSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  merchantId: Type.String({ format: 'uuid' }),
  timeZone: Type.String(),
});

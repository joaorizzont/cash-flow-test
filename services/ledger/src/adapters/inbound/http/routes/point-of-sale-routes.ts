import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { LedgerApi } from '../ledger-api.js';
import { MerchantHeadersSchema, problemResponses } from '../schemas/common-schemas.js';
import {
  ConfigurePointOfSaleBodySchema,
  PointOfSaleParamsSchema,
  PointOfSaleViewSchema,
} from '../schemas/point-of-sale-schemas.js';

export const pointOfSaleRoutes =
  (api: LedgerApi): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.put(
      '/v1/points-of-sale/:pointOfSaleId',
      {
        schema: {
          tags: ['points of sale'],
          summary: 'Create or update a point of sale with its local time zone',
          headers: MerchantHeadersSchema,
          params: PointOfSaleParamsSchema,
          body: ConfigurePointOfSaleBodySchema,
          response: { 200: PointOfSaleViewSchema, ...problemResponses },
        },
      },
      async (request) =>
        api.configurePointOfSale.execute({
          merchantId: request.headers['x-merchant-id'],
          pointOfSaleId: request.params.pointOfSaleId,
          timeZone: request.body.timeZone,
        }),
    );
  };

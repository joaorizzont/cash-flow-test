import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { LedgerApi } from '../ledger-api.js';
import { problemResponses } from '../schemas/common-schemas.js';
import {
  ConfigurePointOfSaleBodySchema,
  PointOfSaleParamsSchema,
  PointOfSaleViewSchema,
} from '../schemas/point-of-sale-schemas.js';
import { principalOf } from '../security/authentication.js';
import { LedgerScope } from '../security/scopes.js';

export const pointOfSaleRoutes = (api: LedgerApi): FastifyPluginAsyncTypebox =>
  async function pointOfSaleRoutes(app) {
    app.put(
      '/v1/points-of-sale/:pointOfSaleId',
      {
        schema: {
          tags: ['points of sale'],
          summary: 'Create or update a point of sale with its local time zone',
          params: PointOfSaleParamsSchema,
          body: ConfigurePointOfSaleBodySchema,
          response: { 200: PointOfSaleViewSchema, ...problemResponses },
        },
        config: { requiredScope: LedgerScope.WRITE },
      },
      async (request) =>
        api.configurePointOfSale.execute({
          merchantId: principalOf(request).merchantId,
          pointOfSaleId: request.params.pointOfSaleId,
          timeZone: request.body.timeZone,
        }),
    );
  };

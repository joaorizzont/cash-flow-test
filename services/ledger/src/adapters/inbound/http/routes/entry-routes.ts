import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { idempotentRequestOf } from '../idempotency.js';
import type { LedgerApi } from '../ledger-api.js';
import {
  IdempotentHeadersSchema,
  MerchantHeadersSchema,
  problemResponses,
} from '../schemas/common-schemas.js';
import {
  EntryListSchema,
  EntryParamsSchema,
  EntryViewSchema,
  ListEntriesQuerySchema,
  RecordEntryBodySchema,
  ReverseEntryBodySchema,
} from '../schemas/entry-schemas.js';

const TAGS = ['entries'];
const REPLAYED_HEADER = 'idempotent-replayed';

const locationOf = (entryId: string): string => `/v1/entries/${entryId}`;

export const entryRoutes =
  (api: LedgerApi): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      '/v1/entries',
      {
        schema: {
          tags: TAGS,
          summary: 'Record a credit or debit entry',
          headers: IdempotentHeadersSchema,
          body: RecordEntryBodySchema,
          response: { 201: EntryViewSchema, ...problemResponses },
        },
      },
      async (request, reply) => {
        const merchantId = request.headers['x-merchant-id'];
        const result = await api.idempotency.execute(
          idempotentRequestOf(request, 'record-entry'),
          () => api.recordEntry.execute({ ...request.body, merchantId }),
        );
        return reply
          .code(201)
          .header('location', locationOf(result.value.id))
          .header(REPLAYED_HEADER, String(result.replayed))
          .send(result.value);
      },
    );

    app.post(
      '/v1/entries/:entryId/reversal',
      {
        schema: {
          tags: TAGS,
          summary: 'Reverse an entry by recording its opposite',
          headers: IdempotentHeadersSchema,
          params: EntryParamsSchema,
          body: ReverseEntryBodySchema,
          response: { 201: EntryViewSchema, ...problemResponses },
        },
        preValidation: async (request) => {
          request.body ??= {};
        },
      },
      async (request, reply) => {
        const merchantId = request.headers['x-merchant-id'];
        const result = await api.idempotency.execute(
          idempotentRequestOf(request, 'reverse-entry'),
          () =>
            api.reverseEntry.execute({
              merchantId,
              entryId: request.params.entryId,
              reason: request.body.reason,
            }),
        );
        return reply
          .code(201)
          .header('location', locationOf(result.value.id))
          .header(REPLAYED_HEADER, String(result.replayed))
          .send(result.value);
      },
    );

    app.get(
      '/v1/entries/:entryId',
      {
        schema: {
          tags: TAGS,
          summary: 'Get an entry',
          headers: MerchantHeadersSchema,
          params: EntryParamsSchema,
          response: { 200: EntryViewSchema, ...problemResponses },
        },
      },
      async (request) =>
        api.getEntry.execute({
          merchantId: request.headers['x-merchant-id'],
          entryId: request.params.entryId,
        }),
    );

    app.get(
      '/v1/entries',
      {
        schema: {
          tags: TAGS,
          summary: 'List entries by business date period',
          headers: MerchantHeadersSchema,
          querystring: ListEntriesQuerySchema,
          response: { 200: EntryListSchema, ...problemResponses },
        },
      },
      async (request) =>
        api.listEntries.execute({ ...request.query, merchantId: request.headers['x-merchant-id'] }),
    );
  };

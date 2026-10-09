import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { EntryMetrics } from '../entry-metrics.js';
import { idempotentRequestOf } from '../idempotency.js';
import type { LedgerApi } from '../ledger-api.js';
import { IdempotentHeadersSchema, problemResponses } from '../schemas/common-schemas.js';
import {
  EntryListSchema,
  EntryParamsSchema,
  EntryViewSchema,
  ListEntriesQuerySchema,
  RecordEntryBodySchema,
  ReverseEntryBodySchema,
} from '../schemas/entry-schemas.js';
import { principalOf } from '../security/authentication.js';
import { LedgerScope } from '../security/scopes.js';

const TAGS = ['entries'];
const REPLAYED_HEADER = 'idempotent-replayed';

const locationOf = (entryId: string): string => `/v1/entries/${entryId}`;

export const entryRoutes = (api: LedgerApi): FastifyPluginAsyncTypebox =>
  async function entryRoutes(app) {
    const entryMetrics = new EntryMetrics();

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
        config: { requiredScope: LedgerScope.WRITE },
      },
      async (request, reply) => {
        const { merchantId } = principalOf(request);
        const result = await api.idempotency.execute(
          idempotentRequestOf(request, { name: 'record-entry', merchantId }),
          () => api.recordEntry.execute({ ...request.body, merchantId }),
        );
        if (!result.replayed) {
          entryMetrics.record(result.value);
        }
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
        config: { requiredScope: LedgerScope.WRITE },
        preValidation: async (request) => {
          request.body ??= {};
        },
      },
      async (request, reply) => {
        const { merchantId } = principalOf(request);
        const result = await api.idempotency.execute(
          idempotentRequestOf(request, { name: 'reverse-entry', merchantId }),
          () =>
            api.reverseEntry.execute({
              merchantId,
              entryId: request.params.entryId,
              reason: request.body.reason,
            }),
        );
        if (!result.replayed) {
          entryMetrics.record(result.value);
        }
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
          params: EntryParamsSchema,
          response: { 200: EntryViewSchema, ...problemResponses },
        },
        config: { requiredScope: LedgerScope.READ },
      },
      async (request) =>
        api.getEntry.execute({
          merchantId: principalOf(request).merchantId,
          entryId: request.params.entryId,
        }),
    );

    app.get(
      '/v1/entries',
      {
        schema: {
          tags: TAGS,
          summary: 'List entries by business date period',
          querystring: ListEntriesQuerySchema,
          response: { 200: EntryListSchema, ...problemResponses },
        },
        config: { requiredScope: LedgerScope.READ },
      },
      async (request) =>
        api.listEntries.execute({ ...request.query, merchantId: principalOf(request).merchantId }),
    );
  };

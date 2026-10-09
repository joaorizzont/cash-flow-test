import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyReply } from 'fastify';
import { ReportSource, type BalanceReportResult } from '../../../../application/index.js';
import type { DailyBalanceApi } from '../daily-balance-api.js';
import { MerchantHeadersSchema, problemResponses } from '../schemas/common-schemas.js';
import {
  BalanceReportSchema,
  DailyBalanceSchema,
  DayParamsSchema,
  PeriodQuerySchema,
} from '../schemas/daily-balance-schemas.js';

const TAGS = ['daily balances'];
const CACHE_HEADER = 'x-cache';

const CACHE_STATUS: Readonly<Record<ReportSource, string>> = {
  [ReportSource.CACHE]: 'HIT',
  [ReportSource.DATABASE]: 'MISS',
  [ReportSource.STALE_CACHE]: 'STALE',
};

const withCacheStatus = (reply: FastifyReply, result: BalanceReportResult): FastifyReply =>
  reply.header(CACHE_HEADER, CACHE_STATUS[result.source]);

export const dailyBalanceRoutes =
  (api: DailyBalanceApi): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.get(
      '/v1/daily-balances/:businessDate',
      {
        schema: {
          tags: TAGS,
          summary: 'Get the consolidated balance of a day',
          headers: MerchantHeadersSchema,
          params: DayParamsSchema,
          response: { 200: DailyBalanceSchema, ...problemResponses },
        },
      },
      async (request, reply) => {
        const { businessDate } = request.params;
        const result = await api.getBalanceReport.execute({
          merchantId: request.headers['x-merchant-id'],
          from: businessDate,
          to: businessDate,
        });
        const { merchantId, days, generatedAt } = result.report;
        return withCacheStatus(reply, result).send({ merchantId, ...days[0], generatedAt });
      },
    );

    app.get(
      '/v1/daily-balances',
      {
        schema: {
          tags: TAGS,
          summary: 'Get the consolidated balances of a period, day by day',
          headers: MerchantHeadersSchema,
          querystring: PeriodQuerySchema,
          response: { 200: BalanceReportSchema, ...problemResponses },
        },
      },
      async (request, reply) => {
        const result = await api.getBalanceReport.execute({
          ...request.query,
          merchantId: request.headers['x-merchant-id'],
        });
        return withCacheStatus(reply, result).send(result.report);
      },
    );
  };

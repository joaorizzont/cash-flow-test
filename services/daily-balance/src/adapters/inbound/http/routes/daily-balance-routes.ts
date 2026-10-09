import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyReply } from 'fastify';
import { ReportSource, type BalanceReportResult } from '../../../../application/index.js';
import type { DailyBalanceApi } from '../daily-balance-api.js';
import { ReportMetrics } from '../report-metrics.js';
import { problemResponses } from '../schemas/common-schemas.js';
import {
  BalanceReportSchema,
  DailyBalanceSchema,
  DayParamsSchema,
  PeriodQuerySchema,
} from '../schemas/daily-balance-schemas.js';
import { principalOf } from '../security/authentication.js';
import { BalanceScope } from '../security/scopes.js';

const TAGS = ['daily balances'];
const CACHE_HEADER = 'x-cache';

const CACHE_STATUS: Readonly<Record<ReportSource, string>> = {
  [ReportSource.CACHE]: 'HIT',
  [ReportSource.DATABASE]: 'MISS',
  [ReportSource.STALE_CACHE]: 'STALE',
};

export const dailyBalanceRoutes = (api: DailyBalanceApi): FastifyPluginAsyncTypebox =>
  async function dailyBalanceRoutes(app) {
    const reportMetrics = new ReportMetrics();
    const withCacheStatus = (reply: FastifyReply, result: BalanceReportResult): FastifyReply => {
      const cacheStatus = CACHE_STATUS[result.source];
      reportMetrics.record(cacheStatus);
      return reply.header(CACHE_HEADER, cacheStatus);
    };

    app.get(
      '/v1/daily-balances/:businessDate',
      {
        schema: {
          tags: TAGS,
          summary: 'Get the consolidated balance of a day',
          params: DayParamsSchema,
          response: { 200: DailyBalanceSchema, ...problemResponses },
        },
        config: { requiredScope: BalanceScope.READ },
      },
      async (request, reply) => {
        const { businessDate } = request.params;
        const result = await api.getBalanceReport.execute({
          merchantId: principalOf(request).merchantId,
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
          querystring: PeriodQuerySchema,
          response: { 200: BalanceReportSchema, ...problemResponses },
        },
        config: { requiredScope: BalanceScope.READ },
      },
      async (request, reply) => {
        const result = await api.getBalanceReport.execute({
          ...request.query,
          merchantId: principalOf(request).merchantId,
        });
        return withCacheStatus(reply, result).send(result.report);
      },
    );
  };

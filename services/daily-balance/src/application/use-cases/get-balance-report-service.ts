import { BalanceReport, MerchantId, ReportPeriod } from '../../domain/index.js';
import { toBalanceReportView } from '../ports/inbound/balance-report-view.js';
import {
  ReportSource,
  type BalanceReportQuery,
  type BalanceReportResult,
  type GetBalanceReport,
} from '../ports/inbound/get-balance-report.js';
import type { Clock } from '../ports/outbound/clock.js';
import type { DailyBalanceReadModel } from '../ports/outbound/daily-balance-read-model.js';

export interface ParsedBalanceReportQuery {
  readonly merchantId: MerchantId;
  readonly period: ReportPeriod;
}

export const parseBalanceReportQuery = (query: BalanceReportQuery): ParsedBalanceReportQuery => ({
  merchantId: MerchantId.from(query.merchantId),
  period: ReportPeriod.parse(query.from, query.to),
});

export interface GetBalanceReportDependencies {
  readonly readModel: DailyBalanceReadModel;
  readonly clock: Clock;
}

export class GetBalanceReportService implements GetBalanceReport {
  constructor(private readonly dependencies: GetBalanceReportDependencies) {}

  async execute(query: BalanceReportQuery): Promise<BalanceReportResult> {
    const { merchantId, period } = parseBalanceReportQuery(query);
    const { readModel, clock } = this.dependencies;
    const [openingBalanceInCents, balances] = await Promise.all([
      readModel.accumulatedBalanceBefore(merchantId, period.from),
      readModel.balancesIn(merchantId, period),
    ]);
    const report = BalanceReport.compose({ merchantId, period, openingBalanceInCents, balances });
    return { report: toBalanceReportView(report, clock.now()), source: ReportSource.DATABASE };
  }
}

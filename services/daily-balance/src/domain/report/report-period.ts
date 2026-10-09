import { BusinessDate } from '../balance/business-date.js';
import { ValidationError } from '../shared/validation-error.js';

export const MAX_REPORT_PERIOD_IN_DAYS = 92;

export class ReportPeriod {
  private constructor(
    readonly from: BusinessDate,
    readonly to: BusinessDate,
  ) {}

  static of(from: BusinessDate, to: BusinessDate): ReportPeriod {
    if (from.isAfter(to)) {
      throw new ValidationError('Period start must not be after period end');
    }
    if (from.daysUntil(to) > MAX_REPORT_PERIOD_IN_DAYS) {
      throw new ValidationError(`Period must not exceed ${MAX_REPORT_PERIOD_IN_DAYS} days`);
    }
    return new ReportPeriod(from, to);
  }

  static parse(from: string, to: string): ReportPeriod {
    return ReportPeriod.of(BusinessDate.from(from), BusinessDate.from(to));
  }

  days(): readonly BusinessDate[] {
    const length = this.from.daysUntil(this.to) + 1;
    return Array.from({ length }, (_, offset) => this.from.addDays(offset));
  }
}

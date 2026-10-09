import { ValidationError } from '../shared/validation-error.js';
import type { BusinessDate } from './business-date.js';
import { BusinessDateOutOfRangeError } from './entry-errors.js';

export class BusinessDatePolicy {
  constructor(private readonly maxBackdatedDays: number) {
    if (!Number.isInteger(maxBackdatedDays) || maxBackdatedDays < 0) {
      throw new ValidationError('Max backdated days must be a non-negative integer');
    }
  }

  assertAcceptable(businessDate: BusinessDate, today: BusinessDate): void {
    const isFuture = businessDate.isAfter(today);
    const isTooOld = businessDate.daysUntil(today) > this.maxBackdatedDays;
    if (isFuture || isTooOld) {
      throw new BusinessDateOutOfRangeError(businessDate, this.maxBackdatedDays);
    }
  }
}

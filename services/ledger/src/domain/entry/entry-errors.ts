import { DomainError } from '../shared/domain-error.js';
import type { BusinessDate } from './business-date.js';
import type { EntryId } from './entry-id.js';

export class BusinessDateOutOfRangeError extends DomainError {
  readonly code = 'BUSINESS_DATE_OUT_OF_RANGE';

  constructor(businessDate: BusinessDate, maxBackdatedDays: number) {
    super(
      `Business date ${businessDate.value} must be between today and ${maxBackdatedDays} days ago`,
    );
  }
}

export class ReversalOfReversalError extends DomainError {
  readonly code = 'REVERSAL_OF_REVERSAL';

  constructor(entryId: EntryId) {
    super(`Entry ${entryId.value} is a reversal and cannot be reversed`);
  }
}

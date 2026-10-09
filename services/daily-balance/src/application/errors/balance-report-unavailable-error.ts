import { DomainError } from '../../domain/index.js';

export class BalanceReportUnavailableError extends DomainError {
  readonly code = 'BALANCE_REPORT_UNAVAILABLE';

  constructor() {
    super('The daily balance report is temporarily unavailable, try again shortly');
  }
}

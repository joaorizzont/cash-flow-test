import { DomainError } from '../shared/domain-error.js';

export class MovementOutOfScopeError extends DomainError {
  readonly code = 'MOVEMENT_OUT_OF_SCOPE';

  constructor(entryId: string, scope: string) {
    super(`Movement of entry ${entryId} does not belong to daily balance ${scope}`);
  }
}

export class BalanceOverflowError extends DomainError {
  readonly code = 'BALANCE_OVERFLOW';

  constructor(scope: string) {
    super(`Daily balance ${scope} exceeds the supported range`);
  }
}

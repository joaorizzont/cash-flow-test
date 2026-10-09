import { DomainError } from '../../domain/index.js';

export class EntryAlreadyReversedError extends DomainError {
  readonly code = 'ENTRY_ALREADY_REVERSED';

  constructor(entryId: string) {
    super(`Entry ${entryId} has already been reversed`);
  }
}

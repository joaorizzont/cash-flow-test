import { DomainError } from '../../domain/index.js';

export class EntryNotFoundError extends DomainError {
  readonly code = 'ENTRY_NOT_FOUND';

  constructor(entryId: string) {
    super(`Entry ${entryId} was not found`);
  }
}

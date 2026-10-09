import { DomainError } from './domain-error.js';

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

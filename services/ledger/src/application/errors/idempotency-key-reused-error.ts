import { DomainError } from '../../domain/index.js';

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor(key: string) {
    super(`Idempotency key ${key} was already used with a different request`);
  }
}

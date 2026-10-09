import { ValidationError } from '../shared/validation-error.js';

export const DESCRIPTION_MAX_LENGTH = 140;

export class Description {
  private constructor(readonly value: string) {}

  static from(value: string): Description {
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > DESCRIPTION_MAX_LENGTH) {
      throw new ValidationError(
        `Description must have between 1 and ${DESCRIPTION_MAX_LENGTH} characters`,
      );
    }
    return new Description(normalized);
  }
}

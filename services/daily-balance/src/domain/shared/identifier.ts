import { ValidationError } from './validation-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export abstract class Identifier {
  readonly value: string;

  protected constructor(value: string, label: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new ValidationError(`Invalid ${label}: ${value}`);
    }
    this.value = value.toLowerCase();
  }

  equals(other: Identifier): boolean {
    return other.constructor === this.constructor && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}

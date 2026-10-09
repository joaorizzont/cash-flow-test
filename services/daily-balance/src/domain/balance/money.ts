import { ValidationError } from '../shared/validation-error.js';

export const SUPPORTED_CURRENCY = 'BRL';

export type Currency = typeof SUPPORTED_CURRENCY;

export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: Currency,
  ) {}

  static of(cents: number, currency: string = SUPPORTED_CURRENCY): Money {
    if (!Number.isSafeInteger(cents) || cents <= 0) {
      throw new ValidationError('Amount must be a positive integer number of cents');
    }
    if (currency !== SUPPORTED_CURRENCY) {
      throw new ValidationError(`Unsupported currency: ${currency}`);
    }
    return new Money(cents, currency);
  }
}

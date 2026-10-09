import { ValidationError } from '../shared/validation-error.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 86_400_000;

const toUtcMilliseconds = (value: string): number => Date.parse(`${value}T00:00:00.000Z`);

const isCalendarDate = (value: string): boolean => {
  const milliseconds = toUtcMilliseconds(value);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString().startsWith(value);
};

export class BusinessDate {
  private constructor(readonly value: string) {}

  static from(value: string): BusinessDate {
    if (!ISO_DATE_PATTERN.test(value) || !isCalendarDate(value)) {
      throw new ValidationError(`Invalid business date: ${value}`);
    }
    return new BusinessDate(value);
  }

  static fromInstant(instant: Date, timeZone: string): BusinessDate {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return BusinessDate.from(formatter.format(instant));
  }

  daysUntil(other: BusinessDate): number {
    return (toUtcMilliseconds(other.value) - toUtcMilliseconds(this.value)) / MILLISECONDS_PER_DAY;
  }

  isAfter(other: BusinessDate): boolean {
    return this.value > other.value;
  }

  equals(other: BusinessDate): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

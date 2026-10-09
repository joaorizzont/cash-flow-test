import { ValidationError } from './validation-error.js';

const IANA_NAME_PATTERN = /^[A-Za-z]+(?:[/_-][A-Za-z0-9+-]+)*$/;

const LOCAL_FORMAT = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
} as const satisfies Intl.DateTimeFormatOptions;

const createFormatter = (timeZone: string): Intl.DateTimeFormat | null => {
  try {
    return new Intl.DateTimeFormat('en-CA', { ...LOCAL_FORMAT, timeZone });
  } catch {
    return null;
  }
};

const toIsoOffset = (gmtOffset: string): string =>
  gmtOffset === 'GMT' ? '+00:00' : gmtOffset.replace('GMT', '');

export class TimeZone {
  private constructor(
    readonly value: string,
    private readonly formatter: Intl.DateTimeFormat,
  ) {}

  static from(value: string): TimeZone {
    const formatter = IANA_NAME_PATTERN.test(value) ? createFormatter(value) : null;
    if (formatter === null) {
      throw new ValidationError(`Invalid time zone: ${value}`);
    }
    return new TimeZone(formatter.resolvedOptions().timeZone, formatter);
  }

  localDateOf(instant: Date): string {
    const part = this.partsOf(instant);
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  localDateTimeOf(instant: Date): string {
    const part = this.partsOf(instant);
    const time = `${part('hour')}:${part('minute')}:${part('second')}`;
    return `${this.localDateOf(instant)}T${time}${toIsoOffset(part('timeZoneName'))}`;
  }

  equals(other: TimeZone): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  private partsOf(instant: Date): (type: Intl.DateTimeFormatPartTypes) => string {
    const parts = new Map(
      this.formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
    );
    return (type) => parts.get(type) ?? '';
  }
}

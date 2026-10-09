import type { Clock } from '../../src/application/index.js';
import { BusinessDate } from '../../src/domain/index.js';

export const SAO_PAULO = 'America/Sao_Paulo';

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant);
  }

  today(): BusinessDate {
    return BusinessDate.fromInstant(this.instant, SAO_PAULO);
  }
}

import type { Clock } from '../../../application/index.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

import type { BusinessDate } from '../../../domain/index.js';

export interface Clock {
  now(): Date;
  today(): BusinessDate;
}

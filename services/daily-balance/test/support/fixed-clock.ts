import type { Clock } from '../../src/application/index.js';

export class FixedClock implements Clock {
  constructor(private current: Date = new Date('2026-10-09T15:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

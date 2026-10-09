import { v7 } from 'uuid';
import type { IdGenerator } from '../../../application/index.js';

export class UuidV7Generator implements IdGenerator {
  next(): string {
    return v7();
  }
}

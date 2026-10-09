import { createPointsOfSaleAndEntries } from './0001-create-points-of-sale-and-entries.js';
import { createOutbox } from './0002-create-outbox.js';
import { createIdempotencyKeys } from './0003-create-idempotency-keys.js';
import type { Migration } from './migration.js';

export type { Migration } from './migration.js';

export const ledgerMigrations: readonly Migration[] = [
  createPointsOfSaleAndEntries,
  createOutbox,
  createIdempotencyKeys,
];

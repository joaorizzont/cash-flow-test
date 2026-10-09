import type { Migration } from './migration.js';

export const createIdempotencyKeys: Migration = {
  id: '0003-create-idempotency-keys',
  sql: `
    CREATE TABLE idempotency_keys (
      merchant_id uuid NOT NULL,
      key varchar(255) NOT NULL,
      operation text NOT NULL,
      request_fingerprint char(64) NOT NULL,
      response jsonb NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (merchant_id, key)
    );
  `,
};

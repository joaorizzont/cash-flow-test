import type { Migration } from './migration.js';

export const addOutboxRetryColumns: Migration = {
  id: '0004-add-outbox-retry-columns',
  sql: `
    ALTER TABLE outbox
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN last_error text NULL,
      ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

    DROP INDEX outbox_unpublished_idx;

    CREATE INDEX outbox_pending_idx ON outbox (next_attempt_at) WHERE published_at IS NULL;
  `,
};

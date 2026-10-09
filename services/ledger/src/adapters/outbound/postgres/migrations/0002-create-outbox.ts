import type { Migration } from './migration.js';

export const createOutbox: Migration = {
  id: '0002-create-outbox',
  sql: `
    CREATE TABLE outbox (
      id uuid PRIMARY KEY,
      aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      occurred_at timestamptz NOT NULL,
      published_at timestamptz NULL
    );

    CREATE INDEX outbox_unpublished_idx ON outbox (occurred_at) WHERE published_at IS NULL;
  `,
};

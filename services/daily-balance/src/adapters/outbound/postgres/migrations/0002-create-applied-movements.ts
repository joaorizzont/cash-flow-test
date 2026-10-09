import type { Migration } from './migration.js';

export const createAppliedMovements: Migration = {
  id: '0002-create-applied-movements',
  sql: `
    CREATE TABLE applied_movements (
      event_id uuid PRIMARY KEY,
      event_type text NOT NULL,
      entry_id uuid NOT NULL,
      merchant_id uuid NOT NULL,
      business_date date NOT NULL,
      entry_type text NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT')),
      amount_cents bigint NOT NULL CHECK (amount_cents > 0),
      occurred_at timestamptz NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT applied_movements_entry_uidx UNIQUE (entry_id)
    );

    CREATE INDEX applied_movements_day_idx ON applied_movements (merchant_id, business_date);
  `,
};

import type { Migration } from './migration.js';

export const createDailyBalances: Migration = {
  id: '0001-create-daily-balances',
  sql: `
    CREATE TABLE daily_balances (
      merchant_id uuid NOT NULL,
      business_date date NOT NULL,
      total_credits_cents bigint NOT NULL DEFAULT 0 CHECK (total_credits_cents >= 0),
      total_debits_cents bigint NOT NULL DEFAULT 0 CHECK (total_debits_cents >= 0),
      balance_cents bigint GENERATED ALWAYS AS (total_credits_cents - total_debits_cents) STORED,
      entry_count integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (merchant_id, business_date)
    );
  `,
};

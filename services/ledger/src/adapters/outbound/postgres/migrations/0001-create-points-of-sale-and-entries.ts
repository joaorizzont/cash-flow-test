import type { Migration } from './migration.js';

export const createPointsOfSaleAndEntries: Migration = {
  id: '0001-create-points-of-sale-and-entries',
  sql: `
    CREATE TABLE points_of_sale (
      merchant_id uuid NOT NULL,
      id uuid NOT NULL,
      time_zone text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (merchant_id, id)
    );

    CREATE TABLE entries (
      id uuid PRIMARY KEY,
      merchant_id uuid NOT NULL,
      point_of_sale_id uuid NULL,
      type text NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
      amount_in_cents bigint NOT NULL CHECK (amount_in_cents > 0),
      currency char(3) NOT NULL CHECK (currency = 'BRL'),
      business_date date NOT NULL,
      description varchar(140) NOT NULL,
      reversal_of uuid NULL REFERENCES entries (id),
      recorded_at timestamptz NOT NULL,
      time_zone text NOT NULL,
      FOREIGN KEY (merchant_id, point_of_sale_id) REFERENCES points_of_sale (merchant_id, id)
    );

    CREATE INDEX entries_merchant_business_date_idx
      ON entries (merchant_id, business_date, recorded_at);

    CREATE UNIQUE INDEX entries_reversal_of_uidx
      ON entries (reversal_of) WHERE reversal_of IS NOT NULL;
  `,
};

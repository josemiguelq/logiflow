-- Billing columns on stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS trial_ends_at DATE,
  ADD COLUMN IF NOT EXISTS billing_day   SMALLINT DEFAULT 1
    CHECK (billing_day BETWEEN 1 AND 28);

-- Back-fill existing stores: 6-month trial from creation date
UPDATE stores
SET trial_ends_at = (created_at + INTERVAL '6 months')::DATE
WHERE trial_ends_at IS NULL;

-- Manual payment records (one row per store per covered month)
CREATE TABLE IF NOT EXISTS store_payments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  reference_month  DATE        NOT NULL,   -- always the 1st of the month
  paid_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT,
  UNIQUE (store_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_store_payments_store ON store_payments(store_id, reference_month);

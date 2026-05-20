ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT    NOT NULL DEFAULT 'prepaid'
    CHECK (payment_method IN ('prepaid', 'cash', 'card')),
  ADD COLUMN IF NOT EXISTS cash_amount    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cash_collected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS handover_token        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS handover_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handover_confirmed_by UUID;

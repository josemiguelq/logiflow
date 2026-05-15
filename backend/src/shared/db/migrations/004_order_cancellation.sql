ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancel_lat                  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cancel_lng                  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cancelled_by_deliverer_id   UUID REFERENCES deliverers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at                TIMESTAMPTZ;

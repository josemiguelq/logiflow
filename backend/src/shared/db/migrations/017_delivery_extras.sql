ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_note   TEXT,
  ADD COLUMN IF NOT EXISTS rating          SMALLINT CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS rating_comment  TEXT,
  ADD COLUMN IF NOT EXISTS rated_at        TIMESTAMPTZ;

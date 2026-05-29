-- Allow multiple proof photos per order.
-- The UNIQUE constraint on order_id is the only blocker; existing rows are untouched.
ALTER TABLE proof_of_delivery
  DROP CONSTRAINT IF EXISTS proof_of_delivery_order_id_key;

-- Add ordering column (existing rows default to 1)
ALTER TABLE proof_of_delivery
  ADD COLUMN IF NOT EXISTS photo_index INTEGER NOT NULL DEFAULT 1;

-- Setting: max proof photos per order (default 1 = same as today)
INSERT INTO settings (name, default_value)
VALUES ('max_proof_photos', '2')
ON CONFLICT (name) DO UPDATE SET default_value = EXCLUDED.default_value;

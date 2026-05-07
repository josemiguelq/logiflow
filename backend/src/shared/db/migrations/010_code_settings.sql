ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS require_pickup_code   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_delivery_code BOOLEAN NOT NULL DEFAULT true;

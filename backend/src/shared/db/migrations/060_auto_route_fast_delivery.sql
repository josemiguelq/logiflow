ALTER TABLE store_auto_route_config
  ADD COLUMN IF NOT EXISTS fast_delivery_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fast_delivery_radius_km    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS fast_delivery_wait_minutes INT;

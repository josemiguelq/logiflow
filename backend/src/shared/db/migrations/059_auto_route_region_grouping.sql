ALTER TABLE store_auto_route_config
  ADD COLUMN IF NOT EXISTS group_by_region  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS region_radius_km NUMERIC(5,2);

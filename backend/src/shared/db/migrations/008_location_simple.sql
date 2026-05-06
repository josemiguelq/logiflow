-- Remove order_id from location_history — position is per-deliverer only
DROP INDEX IF EXISTS idx_location_order_time;
ALTER TABLE location_history DROP COLUMN IF EXISTS order_id;

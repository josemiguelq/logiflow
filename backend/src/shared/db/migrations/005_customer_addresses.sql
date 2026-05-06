CREATE TABLE customer_addresses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id    UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL DEFAULT 'Principal',
  address     TEXT        NOT NULL,
  complement  TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- Migrate existing customers: create a default address entry for each
INSERT INTO customer_addresses (customer_id, store_id, label, address, complement, lat, lng, is_default)
SELECT id, store_id, 'Principal', address, complement, lat, lng, true
FROM customers;

-- Delivery address override on orders (when a non-default address is selected)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_lat     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng     DOUBLE PRECISION;

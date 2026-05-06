CREATE TABLE routes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  deliverer_id UUID        NOT NULL REFERENCES deliverers(id),
  pickup_code  TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'CREATED'
                           CHECK (status IN ('CREATED','STARTED','FINISHED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX idx_routes_store     ON routes(store_id);
CREATE INDEX idx_routes_deliverer ON routes(deliverer_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id);
CREATE INDEX IF NOT EXISTS idx_orders_route ON orders(route_id);

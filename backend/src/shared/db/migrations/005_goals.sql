CREATE TABLE IF NOT EXISTS deliverer_goals (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID    NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  deliverer_id UUID    NOT NULL REFERENCES deliverers(id)  ON DELETE CASCADE,
  type         TEXT    NOT NULL CHECK (type IN ('deliveries', 'avg_rating', 'cancellation_rate', 'avg_delivery_time')),
  target       NUMERIC NOT NULL,
  period       TEXT    NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, deliverer_id, type, period)
);

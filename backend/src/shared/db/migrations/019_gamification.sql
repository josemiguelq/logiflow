-- Gamificação do entregador: metas configuráveis, registro de aceite e histórico
-- de conquistas diárias (snapshot da meta por dia).

-- Metas configuráveis por loja (override em store_setting_values).
INSERT INTO settings (name, default_value) VALUES
  ('achv_routes_target',   '5'),   -- X: rotas finalizadas no dia (Mestre das Rotas)
  ('achv_caravan_orders',  '8'),   -- Y: pedidos numa mesma rota (Capitão da Caravana)
  ('achv_hunter_minutes',  '10'),  -- Z: minutos desde a criação para o aceite contar
  ('achv_hunter_count',    '3')    -- N: aceites rápidos no dia (Caçador de Pedidos)
ON CONFLICT (name) DO NOTHING;

-- Momento em que o pedido foi aceito (virou ASSIGNED). Backfill a partir do
-- primeiro evento ASSIGNED no log de auditoria.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

UPDATE orders
SET accepted_at = (
  SELECT (e->>'at')::timestamptz
  FROM jsonb_array_elements(log) e
  WHERE e->>'action' = 'ASSIGNED'
  ORDER BY (e->>'at')::timestamptz ASC
  LIMIT 1
)
WHERE accepted_at IS NULL
  AND jsonb_typeof(log) = 'array';

CREATE INDEX IF NOT EXISTS idx_orders_accepted_at ON orders(deliverer_id, accepted_at);

-- Conquistas diárias conquistadas (presença da linha = conquistado).
CREATE TABLE IF NOT EXISTS deliverer_daily_achievements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  deliverer_id UUID        NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  day          DATE        NOT NULL,   -- no fuso da loja (America/Sao_Paulo)
  achievement  TEXT        NOT NULL CHECK (achievement IN ('ROUTE_MASTER','CARAVAN_CAPTAIN','ORDER_HUNTER')),
  target       NUMERIC     NOT NULL,   -- snapshot da meta vigente (X / Y / N)
  metric       JSONB       NOT NULL,   -- justificativa: {routes} | {maxOrders} | {fastCount, minutes}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deliverer_id, day, achievement)
);

CREATE INDEX IF NOT EXISTS idx_dda_deliverer_day ON deliverer_daily_achievements(deliverer_id, day);
CREATE INDEX IF NOT EXISTS idx_dda_store_day     ON deliverer_daily_achievements(store_id, day);

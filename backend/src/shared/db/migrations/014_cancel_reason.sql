-- Motivo estruturado do cancelamento (código), para permitir GROUP BY nos
-- relatórios de erros de operação. Texto livre do motivo "OTHER" continua em
-- delivery_note. Cancelamentos antigos ficam com cancel_reason NULL.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_cancel_reason
  ON orders(store_id, cancel_reason);

-- Feature de Prioridade: pedido pode ser marcado como prioritário, com um horário
-- máximo de entrega (opcional). O índice parcial serve à ordenação priority-first e
-- à varredura de prazo estourado.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_priority       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_delivery_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_priority
  ON orders (store_id, is_priority) WHERE is_priority;

-- DOWN (rollback)
-- DROP INDEX IF EXISTS idx_orders_priority;
-- ALTER TABLE orders DROP COLUMN IF EXISTS max_delivery_time;
-- ALTER TABLE orders DROP COLUMN IF EXISTS is_priority;

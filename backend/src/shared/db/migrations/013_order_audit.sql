-- Auditoria e métricas de tempo dos pedidos.
--  out_for_delivery_at: momento em que o status virou OUT_FOR_DELIVERY.
--  log:     array de auditoria { at, by, action, details } para cada mudança.
--  summary: tempos entre cada mudança de status, calculado na entrega.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS log     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary JSONB;

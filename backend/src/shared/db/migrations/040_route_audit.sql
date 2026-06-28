-- Log de auditoria das rotas (mesmo formato de orders.log): array de
-- { at, by, action, details } para cada atualização da rota.
ALTER TABLE routes ADD COLUMN IF NOT EXISTS log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Limpeza one-off: finaliza rotas presas (sem pedidos pendentes), incluindo as
-- que ficaram "Em andamento" (STARTED) com 0 pedidos.
UPDATE routes r
SET status = 'FINISHED', finished_at = COALESCE(finished_at, now())
WHERE r.status <> 'FINISHED'
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.route_id = r.id AND o.status NOT IN ('DELIVERED','CANCELLED')
  );

-- DOWN (rollback)
-- ALTER TABLE routes DROP COLUMN IF EXISTS log;

-- Sinaliza se a rota foi criada pelo scanner de rotas automáticas (scan-auto-routes.ts)
-- ou manualmente (operador/entregador). Hoje o único indício era o log JSONB da rota
-- (by.type === 'system'), que só é retornado no detalhe — o operador não conseguia
-- identificar isso na listagem sem abrir a rota e expandir o histórico.

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false;

-- Backfill: o log JSONB existe desde a 040_route_audit.sql, bem antes desta
-- coluna — toda rota automática já criada carrega log[0].details.trigger =
-- 'auto_route'. Recupera o sinal retroativamente em vez de deixar o histórico
-- todo como "manual".
UPDATE routes
SET auto_created = true
WHERE log->0->'details'->>'trigger' = 'auto_route';

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- ALTER TABLE routes DROP COLUMN IF EXISTS auto_created;

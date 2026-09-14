-- Sinaliza se a rota foi criada pelo scanner de rotas automáticas (scan-auto-routes.ts)
-- ou manualmente (operador/entregador). Hoje o único indício era o log JSONB da rota
-- (by.type === 'system'), que só é retornado no detalhe — o operador não conseguia
-- identificar isso na listagem sem abrir a rota e expandir o histórico.

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false;

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- ALTER TABLE routes DROP COLUMN IF EXISTS auto_created;

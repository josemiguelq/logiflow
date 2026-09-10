-- Soft delete de pedidos e rotas.
-- Motivo: excluir um pedido/rota permanentemente é irreversível (o pedido é o
-- registro central de entregas, pagamentos, provas e mensagens). Em vez de
-- DELETE, marcamos deleted_at/deleted_by e filtramos nas listagens.
-- As colunas também permitem auditoria: quem deletou e quando (deleted_by/deleted_at).

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES store_users(id) ON DELETE SET NULL;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES store_users(id) ON DELETE SET NULL;

-- Índices parciais: as listagens filtram sempre deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_orders_store_active
  ON orders(store_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_routes_store_active
  ON routes(store_id) WHERE deleted_at IS NULL;

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- DROP INDEX IF EXISTS idx_routes_store_active;
-- DROP INDEX IF EXISTS idx_orders_store_active;
-- ALTER TABLE routes  DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE orders  DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
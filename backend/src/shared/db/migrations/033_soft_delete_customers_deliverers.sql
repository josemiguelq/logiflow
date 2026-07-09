-- Soft delete de clientes e entregadores.
-- Motivo: "excluir" não pode apagar a linha, senão perdemos os pedidos associados
-- (orders.customer_id é NOT NULL/RESTRICT; routes.deliverer_id também é RESTRICT).
-- Em vez de DELETE, marcamos deleted_at/deleted_by e filtramos nas listagens.
-- is_active (entregadores) continua sendo "pausa" reversível, distinto da exclusão.

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES store_users(id) ON DELETE SET NULL;

ALTER TABLE deliverers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES store_users(id) ON DELETE SET NULL;

-- Índices parciais: as listagens filtram sempre deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_customers_store_active
  ON customers(store_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliverers_store_active
  ON deliverers(store_id) WHERE deleted_at IS NULL;

-- Reuso de telefone após exclusão: a unicidade passa a valer só para os ativos,
-- permitindo recadastrar um cliente cujo telefone foi excluído.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_store_id_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_active
  ON customers(store_id, phone) WHERE deleted_at IS NULL;

-- Idem para o username do entregador (único por loja desde a 029).
ALTER TABLE deliverers DROP CONSTRAINT IF EXISTS deliverers_store_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliverers_username_active
  ON deliverers(store_id, username) WHERE deleted_at IS NULL;

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- DROP INDEX IF EXISTS uq_deliverers_username_active;
-- ALTER TABLE deliverers ADD CONSTRAINT deliverers_store_username_key UNIQUE (store_id, username);
-- DROP INDEX IF EXISTS uq_customers_phone_active;
-- ALTER TABLE customers ADD CONSTRAINT customers_store_id_phone_key UNIQUE (store_id, phone);
-- DROP INDEX IF EXISTS idx_deliverers_store_active;
-- DROP INDEX IF EXISTS idx_customers_store_active;
-- ALTER TABLE deliverers DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE customers  DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;

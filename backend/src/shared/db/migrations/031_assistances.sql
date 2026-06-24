-- Assistências (assistances): entidade de referência por loja. Um cliente PODE
-- pertencer a uma assistência (vínculo opcional). Segue o padrão multi-tenant
-- (store_id) e de auditoria (quem/quando/o quê) do projeto.
CREATE TABLE IF NOT EXISTS assistances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  created_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_assistances_store ON assistances(store_id);

-- Vínculo opcional do cliente com a assistência. ON DELETE SET NULL: excluir
-- uma assistência não apaga os clientes, só desfaz o vínculo.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS assistance_id UUID REFERENCES assistances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_assistance ON customers(assistance_id);

-- Auditoria de assistências (mesmo padrão de customer_address_audit).
CREATE TABLE IF NOT EXISTS assistance_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  assistance_id   UUID,                       -- sem FK: pode ter sido excluída
  action          TEXT        NOT NULL CHECK (action IN ('CREATED','UPDATED','DELETED')),
  before          JSONB,                      -- estado anterior (null em CREATED)
  after           JSONB,                      -- estado novo (null em DELETED)
  changed_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistance_audit ON assistance_audit(assistance_id, changed_at DESC);

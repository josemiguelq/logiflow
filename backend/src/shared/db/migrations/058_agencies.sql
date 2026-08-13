-- Agências (agencies): ponto de terceiro para entrega terceirizada (ex.: agência
-- dos Correios). Entidade de referência por loja, com nome + endereço + coordenadas
-- (para a validação de proximidade). Segue o padrão de `assistances`.
CREATE TABLE IF NOT EXISTS agencies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  address         TEXT        NOT NULL,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  created_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agencies_store ON agencies(store_id);

-- Vínculo opcional do cliente com a agência. ON DELETE SET NULL: excluir uma
-- agência não apaga os clientes, só desfaz o vínculo. Quando presente, o cliente
-- é "entrega via agência" (terceirizada).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_agency ON customers(agency_id);

-- Snapshot da agência no pedido (no momento da criação): mostra-se o endereço da
-- agência no pedido e valida-se a proximidade por ele. O endereço real do cliente
-- continua em delivery_address (para a etiqueta).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS agency_id       UUID,
  ADD COLUMN IF NOT EXISTS agency_name     TEXT,
  ADD COLUMN IF NOT EXISTS agency_address  TEXT,
  ADD COLUMN IF NOT EXISTS agency_lat      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS agency_lng      DOUBLE PRECISION;

-- Auditoria de agências (mesmo padrão de assistance_audit).
CREATE TABLE IF NOT EXISTS agency_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agency_id       UUID,
  action          TEXT        NOT NULL CHECK (action IN ('CREATED','UPDATED','DELETED')),
  before          JSONB,
  after           JSONB,
  changed_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_audit ON agency_audit(agency_id, changed_at DESC);

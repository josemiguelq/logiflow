-- Auditoria de alterações de endereço do cliente: quem mudou, quando e o quê
-- (antes/depois). Tabela dedicada — não altera como os endereços são lidos.
CREATE TABLE IF NOT EXISTS customer_address_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_id      UUID,                       -- id do endereço (sem FK: pode ter sido excluído)
  action          TEXT        NOT NULL CHECK (action IN ('CREATED','UPDATED','DELETED')),
  before          JSONB,                      -- estado anterior (null em CREATED)
  after           JSONB,                      -- estado novo (null em DELETED)
  changed_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caa_customer ON customer_address_audit(customer_id, changed_at DESC);

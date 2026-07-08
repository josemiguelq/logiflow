-- Criação automática de rotas (rodízio de entregadores).
-- Config por loja (opcional, ativável) + lista ordenada do rodízio + auditoria
-- antes/depois das alterações da config. Não altera fluxos existentes.

-- Config por loja: uma linha por loja com a feature (default desativada).
CREATE TABLE IF NOT EXISTS store_auto_route_config (
  store_id      UUID        PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  enabled       BOOLEAN     NOT NULL DEFAULT false,
  wait_minutes  INT         NOT NULL DEFAULT 15,   -- gatilho: pedido mais antigo esperando
  queue_size    INT         NOT NULL DEFAULT 5,    -- gatilho: qtd de pedidos em Preparando
  max_orders    INT,                               -- cap opcional por rota (null = todos)
  turn_position INT         NOT NULL DEFAULT 0,    -- ponteiro do rodízio (índice, 0-based)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID        REFERENCES store_users(id) ON DELETE SET NULL
);

-- Rodízio: entregadores participantes e sua ordem (position). O "entregador da
-- vez" é derivado de turn_position pulando quem está offline.
CREATE TABLE IF NOT EXISTS store_auto_route_deliverers (
  store_id     UUID NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  deliverer_id UUID NOT NULL REFERENCES deliverers(id)  ON DELETE CASCADE,
  position     INT  NOT NULL,
  PRIMARY KEY (store_id, deliverer_id),
  UNIQUE (store_id, position)
);

CREATE INDEX IF NOT EXISTS idx_sard_store_position
  ON store_auto_route_deliverers(store_id, position);

-- Auditoria das alterações da config (quem/quando/antes/depois).
CREATE TABLE IF NOT EXISTS store_auto_route_config_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL DEFAULT 'UPDATED' CHECK (action IN ('UPDATED')),
  before          JSONB,      -- estado anterior (null na primeira gravação)
  after           JSONB,      -- estado novo
  changed_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sarca_store ON store_auto_route_config_audit(store_id, changed_at DESC);

-- Concede o novo scope 'routes:auto_config' aos papéis que o têm por padrão
-- (OWNER, MANAGER) nas lojas existentes, cujas linhas de store_role_scopes já
-- foram gravadas com a lista antiga.
UPDATE store_role_scopes
SET scopes = scopes || '["routes:auto_config"]'::jsonb,
    updated_at = now()
WHERE role IN ('OWNER', 'MANAGER')
  AND NOT (scopes @> '["routes:auto_config"]'::jsonb);

-- DOWN (rollback) — manter comentado (convenção do repo)
-- DROP TABLE IF EXISTS store_auto_route_config_audit;
-- DROP TABLE IF EXISTS store_auto_route_deliverers;
-- DROP TABLE IF EXISTS store_auto_route_config;
-- UPDATE store_role_scopes SET scopes = scopes - 'routes:auto_config' WHERE role IN ('OWNER','MANAGER');

-- Sessões/acessos do operador: rastreio por IP+dispositivo, último login e
-- revogação (a denylist de jti fica no Redis; aqui é a fonte de verdade/histórico).

ALTER TABLE store_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS store_user_sessions (
  id            UUID        PRIMARY KEY,            -- = jti do JWT
  store_user_id UUID        NOT NULL REFERENCES store_users(id) ON DELETE CASCADE,
  store_id      UUID        NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ                          -- null = ativa
);

CREATE INDEX IF NOT EXISTS idx_sus_user  ON store_user_sessions(store_user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sus_store ON store_user_sessions(store_id);

-- Concede o novo scope aos OWNER existentes (linhas já gravadas em store_role_scopes).
UPDATE store_role_scopes
SET scopes = scopes || '["sessions:view_all"]'::jsonb, updated_at = now()
WHERE role = 'OWNER' AND NOT (scopes @> '["sessions:view_all"]'::jsonb);

-- Termo de consentimento do lojista (cadastro). Rastreia aceite obrigatório
-- da política de privacidade e termos de uso conforme LGPD.

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE store_users
  ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at      TIMESTAMPTZ;

-- Trilha de auditoria append-only do aceite (quem/quando/versão/IP/dispositivo).
CREATE TABLE IF NOT EXISTS store_terms_acceptance (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id UUID        NOT NULL REFERENCES store_users(id),
  store_id      UUID        NOT NULL REFERENCES stores(id),
  version       TEXT        NOT NULL,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sta_user
  ON store_terms_acceptance(store_user_id, accepted_at DESC);

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- DROP INDEX IF EXISTS idx_sta_user;
-- DROP TABLE IF EXISTS store_terms_acceptance;
-- ALTER TABLE store_users
--   DROP COLUMN IF EXISTS terms_accepted_at,
--   DROP COLUMN IF EXISTS terms_accepted_version;

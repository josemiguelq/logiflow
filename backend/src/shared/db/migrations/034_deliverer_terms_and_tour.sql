-- Termo de uso do entregador (aceite obrigatório + registro auditável) e
-- flag do guia (coach-mark) do switch de disponibilidade.

-- ── UP ───────────────────────────────────────────────────────────────────────

ALTER TABLE deliverers
  ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_switch_tour      BOOLEAN NOT NULL DEFAULT true;

-- Trilha de auditoria append-only do aceite (quem/quando/versão/IP/dispositivo).
CREATE TABLE IF NOT EXISTS deliverer_terms_acceptance (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverer_id UUID        NOT NULL REFERENCES deliverers(id),
  store_id     UUID        NOT NULL REFERENCES stores(id),
  version      TEXT        NOT NULL,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_dta_deliverer
  ON deliverer_terms_acceptance(deliverer_id, accepted_at DESC);

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- DROP INDEX IF EXISTS idx_dta_deliverer;
-- DROP TABLE IF EXISTS deliverer_terms_acceptance;
-- ALTER TABLE deliverers
--   DROP COLUMN IF EXISTS needs_switch_tour,
--   DROP COLUMN IF EXISTS terms_accepted_at,
--   DROP COLUMN IF EXISTS terms_accepted_version;

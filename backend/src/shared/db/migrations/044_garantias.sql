-- Garantias: confirmação de garantia pelo cliente.
-- Duas tabelas: (1) configuração de perguntas por loja (warranty_question_sets),
-- (2) registros de garantia (warranties) — append-only, imutável após confirmado.

CREATE TABLE IF NOT EXISTS warranty_question_sets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  video_url       TEXT,
  questions       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  updated_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_warranty_question_sets_store ON warranty_question_sets(store_id);

CREATE TABLE IF NOT EXISTS warranties (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token               TEXT        NOT NULL UNIQUE,
  customer_name       TEXT        NOT NULL,
  parts               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  sale_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
  questions_snapshot  JSONB,
  answers             JSONB,
  signature_path      TEXT,
  response_ip         TEXT,
  response_user_agent TEXT,
  confirmed_at        TIMESTAMPTZ,
  created_by          UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranties_store ON warranties(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranties_token ON warranties(token);

-- DOWN
-- DROP TABLE IF EXISTS warranties;
-- DROP TABLE IF EXISTS warranty_question_sets;

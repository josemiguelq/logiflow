-- Garantia por cliente + versionamento dos termos.
--
-- Antes: uma garantia (warranties) era criada por array de peças, com link
-- (token) por registro. Agora o aceite é POR CLIENTE, assinado 1x; quando os
-- termos mudam, publica-se uma nova VERSÃO e o cliente re-assina.
--
-- Três tabelas novas:
--   (1) warranty_terms_versions  — versões publicadas, imutáveis, por loja.
--   (2) warranty_client_links    — token estável por cliente (link reutilizável).
--   (3) warranty_acceptances     — aceite por cliente por versão (append-only).
--
-- warranty_question_sets (existente) segue como o RASCUNHO editável por loja;
-- publicar = snapshot do rascunho numa nova terms_version.
--
-- A tabela warranties antiga é mantida como legado (não é dropada no UP); os
-- dados são migrados para as novas tabelas abaixo.

-- ── (1) Versões publicadas dos termos ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warranty_terms_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  version           INT         NOT NULL,
  video_url         TEXT,
  questions         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_current        BOOLEAN     NOT NULL DEFAULT true,
  published_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  published_by_name TEXT,
  published_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, version)
);

-- Só uma versão "current" por loja.
CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_terms_current
  ON warranty_terms_versions(store_id) WHERE is_current;

-- ── (2) Link estável por cliente ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warranty_client_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token           TEXT        NOT NULL UNIQUE,
  created_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_warranty_client_links_token ON warranty_client_links(token);

-- ── (3) Aceite por cliente por versão ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warranty_acceptances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id         UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name       TEXT        NOT NULL,
  terms_version_id    UUID        NOT NULL REFERENCES warranty_terms_versions(id) ON DELETE RESTRICT,
  terms_version       INT         NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
  questions_snapshot  JSONB,
  answers             JSONB,
  signature_path      TEXT,
  response_ip         TEXT,
  response_user_agent TEXT,
  confirmed_at        TIMESTAMPTZ,
  created_by          UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, customer_id, terms_version_id)
);

CREATE INDEX IF NOT EXISTS idx_warranty_acceptances_customer ON warranty_acceptances(store_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_warranty_acceptances_version  ON warranty_acceptances(store_id, terms_version_id);

-- DOWN
-- DROP TABLE IF EXISTS warranty_acceptances;
-- DROP TABLE IF EXISTS warranty_client_links;
-- DROP TABLE IF EXISTS warranty_terms_versions;

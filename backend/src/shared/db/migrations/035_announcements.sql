-- Announcements: comunicados da loja que aparecem como popup no app do entregador.
-- O operador (scope announcements:manage) cria; o entregador marca como lido.

-- ── UP ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title            TEXT,
  body             TEXT        NOT NULL DEFAULT '',   -- markdown
  emoji            TEXT,
  accent_color     TEXT,
  background_color TEXT,
  text_color       TEXT,
  active           BOOLEAN     NOT NULL DEFAULT true,
  expires_at       TIMESTAMPTZ,
  created_by       UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_store_active ON announcements(store_id) WHERE active = true;

-- Leitura por entregador (idempotente via PK composta).
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  deliverer_id    UUID        NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, deliverer_id)
);

-- ── DOWN (rollback manual — o runner é forward-only) ─────────────────────────
-- DROP TABLE IF EXISTS announcement_reads;
-- DROP INDEX IF EXISTS idx_announcements_store_active;
-- DROP TABLE IF EXISTS announcements;

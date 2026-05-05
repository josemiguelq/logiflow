-- store_theme
CREATE TABLE store_theme (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  primary_color   VARCHAR(7)  NOT NULL DEFAULT '#2563EB',
  secondary_color VARCHAR(7)  NOT NULL DEFAULT '#F9FAFB',
  accent_color    VARCHAR(7)  NOT NULL DEFAULT '#F97316',
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- store_features
CREATE TABLE store_features (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  custom_theme_enabled BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- super_admins
CREATE TABLE super_admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LogiFlow — complete schema (consolidated)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMs ────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE store_user_role  AS ENUM ('OWNER', 'MANAGER', 'ASSISTANT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE deliverer_status AS ENUM ('AVAILABLE', 'ON_ROUTE', 'OFFLINE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status     AS ENUM ('PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE whatsapp_status  AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_status   AS ENUM ('PENDING', 'SENT', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── stores ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT             NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  street        TEXT,
  street_number TEXT,
  city          TEXT,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ─── super_admins ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── store_theme ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_theme (
  id              UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID       NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  primary_color   VARCHAR(7) NOT NULL DEFAULT '#2563EB',
  secondary_color VARCHAR(7) NOT NULL DEFAULT '#F9FAFB',
  accent_color    VARCHAR(7) NOT NULL DEFAULT '#F97316',
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── features (catalog) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS features (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── store_features_enabled (store ↔ feature junction) ───────────────────────
CREATE TABLE IF NOT EXISTS store_features_enabled (
  store_id   UUID        NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  feature_id UUID        NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, feature_id)
);

-- ─── settings (catalog) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id            SERIAL PRIMARY KEY,
  name          TEXT   NOT NULL UNIQUE,
  default_value TEXT   NOT NULL DEFAULT ''
);

-- ─── store_setting_values (store ↔ setting junction) ─────────────────────────
CREATE TABLE IF NOT EXISTS store_setting_values (
  store_id   UUID    NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  setting_id INTEGER NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  value      TEXT    NOT NULL,
  PRIMARY KEY (store_id, setting_id)
);

-- ─── store_role_scopes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_role_scopes (
  store_id   UUID            NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role       store_user_role NOT NULL,
  scopes     JSONB           NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, role)
);

-- ─── store_users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_users (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID            NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT            NOT NULL,
  email         TEXT            NOT NULL UNIQUE,
  username      TEXT            NOT NULL,
  password_hash TEXT            NOT NULL,
  role          store_user_role NOT NULL DEFAULT 'ASSISTANT',
  active        BOOLEAN         NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_users_username ON store_users(username);
CREATE INDEX        IF NOT EXISTS idx_store_users_store    ON store_users(store_id);

-- ─── deliverers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverers (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID             NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name              TEXT             NOT NULL,
  email             TEXT,
  username          TEXT             NOT NULL UNIQUE,
  password_hash     TEXT             NOT NULL,
  profile_image_url TEXT,
  status            deliverer_status NOT NULL DEFAULT 'OFFLINE',
  is_active         BOOLEAN          NOT NULL DEFAULT true,
  needs_onboarding  BOOLEAN          NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverers_store ON deliverers(store_id);

-- ─── customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID             NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT             NOT NULL,
  phone      TEXT             NOT NULL,
  address    TEXT             NOT NULL,
  number     TEXT,
  complement TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
  UNIQUE(store_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);

-- ─── customer_addresses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID             NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id    UUID             NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  label       TEXT             NOT NULL DEFAULT 'Principal',
  address     TEXT             NOT NULL,
  number      TEXT,
  complement  TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  is_default  BOOLEAN          NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ─── routes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  deliverer_id UUID        NOT NULL REFERENCES deliverers(id),
  pickup_code  TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'CREATED'
                           CHECK (status IN ('CREATED','STARTED','FINISHED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_routes_store     ON routes(store_id);
CREATE INDEX IF NOT EXISTS idx_routes_deliverer ON routes(deliverer_id);

-- ─── orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID         NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  deliverer_id       UUID                  REFERENCES deliverers(id)  ON DELETE SET NULL,
  customer_id        UUID         NOT NULL REFERENCES customers(id),
  created_by_user_id UUID         NOT NULL REFERENCES store_users(id),
  status             order_status NOT NULL DEFAULT 'PREPARING',
  route_id           UUID                  REFERENCES routes(id),
  route_position     INT,
  pickup_code        CHAR(5)      NOT NULL,
  delivery_code      CHAR(5)      NOT NULL,
  notes              TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  delivery_address   TEXT,
  delivery_lat       DOUBLE PRECISION,
  delivery_lng       DOUBLE PRECISION,
  delivery_note      TEXT,
  rating             SMALLINT     CHECK (rating >= 1 AND rating <= 5),
  rating_comment     TEXT,
  rated_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  picked_up_at       TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_store      ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_deliverer  ON orders(deliverer_id);
CREATE INDEX IF NOT EXISTS idx_orders_route      ON orders(route_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(store_id, created_at DESC);

-- ─── location_history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_history (
  id           BIGSERIAL        PRIMARY KEY,
  deliverer_id UUID             NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  recorded_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_deliverer_time ON location_history(deliverer_id, recorded_at DESC);

-- ─── deliverer_status_history ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverer_status_history (
  id           BIGSERIAL        PRIMARY KEY,
  deliverer_id UUID             NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  store_id     UUID             NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  status       TEXT             NOT NULL CHECK (status IN ('AVAILABLE','ON_ROUTE','OFFLINE')),
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  changed_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsh_deliverer ON deliverer_status_history(deliverer_id, changed_at DESC);

-- ─── proof_of_delivery ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID             NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  photo_url  TEXT             NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ─── whatsapp_sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID            NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  status       whatsapp_status NOT NULL DEFAULT 'DISCONNECTED',
  session_data JSONB,
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- ─── whatsapp_keys ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_keys (
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL,
  key_id   TEXT NOT NULL,
  key_data JSONB NOT NULL,
  PRIMARY KEY (store_id, key_type, key_id)
);

-- ─── message_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_logs (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID           NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id   UUID                    REFERENCES orders(id) ON DELETE SET NULL,
  phone      TEXT           NOT NULL,
  message    TEXT           NOT NULL,
  status     message_status NOT NULL DEFAULT 'PENDING',
  attempts   INT            NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_store ON message_logs(store_id, created_at DESC);

-- ─── migration tracker ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  name   TEXT        PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── seed: feature catalog ────────────────────────────────────────────────────
INSERT INTO features (name, description) VALUES
  ('whatsapp',        'Integração com WhatsApp'),
  ('custom_theme',    'Customização de cores e logo'),
  ('csv_export',      'Download de CSV de pedidos e rotas'),
  ('customer_ratings','Permite que clientes avaliem a entrega com até 5 estrelas')
ON CONFLICT (name) DO NOTHING;

-- ─── seed: settings catalog ───────────────────────────────────────────────────
INSERT INTO settings (name, default_value) VALUES
  ('max_orders_per_route',   '5'),
  ('require_delivery_photo', 'false'),
  ('require_pickup_code',    'true'),
  ('require_delivery_code',  'true'),
  ('allow_customer_ratings', 'false')
ON CONFLICT (name) DO NOTHING;

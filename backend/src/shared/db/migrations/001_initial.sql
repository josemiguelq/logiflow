-- LogiFlow — initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── stores ────────────────────────────────────────────────────────────────
CREATE TABLE stores (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── store_settings ────────────────────────────────────────────────────────
CREATE TABLE store_settings (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  max_orders_per_route   INT         NOT NULL DEFAULT 5,
  require_delivery_photo BOOLEAN     NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id)
);

-- ─── store_users ───────────────────────────────────────────────────────────
CREATE TYPE store_user_role AS ENUM ('OWNER', 'MANAGER', 'ASSISTANT');

CREATE TABLE store_users (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID             NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT             NOT NULL,
  email         TEXT             NOT NULL UNIQUE,
  password_hash TEXT             NOT NULL,
  role          store_user_role  NOT NULL DEFAULT 'ASSISTANT',
  active        BOOLEAN          NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_users_store ON store_users(store_id);

-- ─── deliverers ────────────────────────────────────────────────────────────
CREATE TYPE deliverer_status AS ENUM ('AVAILABLE', 'ON_ROUTE', 'OFFLINE');

CREATE TABLE deliverers (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID             NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name              TEXT             NOT NULL,
  email             TEXT,
  username          TEXT             NOT NULL UNIQUE,
  password_hash     TEXT             NOT NULL,
  profile_image_url TEXT,
  status            deliverer_status NOT NULL DEFAULT 'OFFLINE',
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliverers_store ON deliverers(store_id);

-- ─── customers ─────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  address     TEXT        NOT NULL,
  complement  TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, phone)
);

CREATE INDEX idx_customers_store ON customers(store_id);

-- ─── orders ────────────────────────────────────────────────────────────────
CREATE TYPE order_status AS ENUM (
  'PREPARING',
  'ASSIGNED',
  'ON_ROUTE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED'
);

CREATE TABLE orders (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  deliverer_id       UUID         REFERENCES deliverers(id) ON DELETE SET NULL,
  customer_id        UUID         NOT NULL REFERENCES customers(id),
  created_by_user_id UUID         NOT NULL REFERENCES store_users(id),
  status             order_status NOT NULL DEFAULT 'PREPARING',
  route_position     INT,
  pickup_code        CHAR(5)      NOT NULL,
  delivery_code      CHAR(5)      NOT NULL,
  notes              TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  picked_up_at       TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ
);

CREATE INDEX idx_orders_store       ON orders(store_id);
CREATE INDEX idx_orders_deliverer   ON orders(deliverer_id);
CREATE INDEX idx_orders_status      ON orders(store_id, status);
CREATE INDEX idx_orders_created_at  ON orders(store_id, created_at DESC);

-- ─── location_history ──────────────────────────────────────────────────────
CREATE TABLE location_history (
  id           BIGSERIAL        PRIMARY KEY,
  deliverer_id UUID             NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  recorded_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_location_deliverer_time
  ON location_history(deliverer_id, recorded_at DESC);

-- ─── proof_of_delivery ─────────────────────────────────────────────────────
CREATE TABLE proof_of_delivery (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID             NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  photo_url  TEXT             NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ─── whatsapp_sessions ─────────────────────────────────────────────────────
CREATE TYPE whatsapp_status AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED');

CREATE TABLE whatsapp_sessions (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID             NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  status       whatsapp_status  NOT NULL DEFAULT 'DISCONNECTED',
  session_data JSONB,
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ─── message_logs ──────────────────────────────────────────────────────────
CREATE TYPE message_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE message_logs (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID           NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id   UUID           REFERENCES orders(id) ON DELETE SET NULL,
  phone      TEXT           NOT NULL,
  message    TEXT           NOT NULL,
  status     message_status NOT NULL DEFAULT 'PENDING',
  attempts   INT            NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_logs_store ON message_logs(store_id, created_at DESC);

-- ─── migrations table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT        PRIMARY KEY,
  run_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

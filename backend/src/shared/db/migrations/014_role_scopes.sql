CREATE TABLE IF NOT EXISTS store_role_scopes (
  store_id   UUID            NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role       store_user_role NOT NULL,
  scopes     JSONB           NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, role)
);

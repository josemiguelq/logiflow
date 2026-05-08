CREATE TABLE IF NOT EXISTS whatsapp_keys (
  store_id  UUID  NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key_type  TEXT  NOT NULL,
  key_id    TEXT  NOT NULL,
  key_data  JSONB NOT NULL,
  PRIMARY KEY (store_id, key_type, key_id)
);

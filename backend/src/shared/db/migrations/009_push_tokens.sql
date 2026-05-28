CREATE TABLE device_tokens (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverer_id UUID         NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  token        TEXT         NOT NULL,
  platform     TEXT         NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (deliverer_id, token)
);

CREATE INDEX idx_device_tokens_deliverer ON device_tokens(deliverer_id);

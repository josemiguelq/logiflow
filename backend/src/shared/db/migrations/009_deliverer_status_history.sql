CREATE TABLE deliverer_status_history (
  id           BIGSERIAL        PRIMARY KEY,
  deliverer_id UUID             NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  store_id     UUID             NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  status       TEXT             NOT NULL CHECK (status IN ('AVAILABLE','ON_ROUTE','OFFLINE')),
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  changed_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_dsh_deliverer ON deliverer_status_history(deliverer_id, changed_at DESC);

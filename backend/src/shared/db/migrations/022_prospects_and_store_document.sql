-- Documento da loja (CPF/CNPJ) e tabela de prospects (cadastro em etapas).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

CREATE TABLE IF NOT EXISTS prospects (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name         TEXT,
  cpf_cnpj           TEXT,
  email              TEXT,
  address            TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  owner_name         TEXT,
  status             TEXT        NOT NULL DEFAULT 'STEP1'
                       CHECK (status IN ('STEP1','STEP2','STEP3','CONVERTED')),
  converted_store_id UUID        REFERENCES stores(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);

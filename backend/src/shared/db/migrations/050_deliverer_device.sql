-- Metadados do aparelho do entregador (suporte/rastreabilidade): modelo,
-- versão do SO e versão do app instalada. Enviados pelo app após login.
ALTER TABLE deliverers
  ADD COLUMN IF NOT EXISTS device_model      TEXT,
  ADD COLUMN IF NOT EXISTS device_os         TEXT,   -- ex.: "Android 14"
  ADD COLUMN IF NOT EXISTS app_version       TEXT,   -- ex.: "1.1.2+3"
  ADD COLUMN IF NOT EXISTS device_updated_at TIMESTAMPTZ;

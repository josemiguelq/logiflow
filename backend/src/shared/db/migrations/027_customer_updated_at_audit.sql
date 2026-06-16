-- Rastreio de alterações no próprio cliente (nome/telefone): quando foi
-- atualizado pela última vez e um histórico embutido (quem/quando/o quê).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS audit      JSONB       NOT NULL DEFAULT '[]'::jsonb;

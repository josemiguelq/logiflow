-- Telefone de contato do lead no cadastro em etapas (prospects).
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone TEXT;

-- DOWN (rollback)
-- ALTER TABLE prospects DROP COLUMN IF EXISTS phone;

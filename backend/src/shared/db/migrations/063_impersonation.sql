-- Impersonação: o OWNER pode "vestir a pele" de outro usuário da loja (MANAGER/
-- ASSISTANT) para dar suporte/depurar sem saber a senha dele. Reaproveita a
-- infraestrutura de sessões (store_user_sessions) já existente — cada sessão
-- de impersonação é uma linha normal, revogável do mesmo jeito, só que marcada
-- com quem a iniciou. Isso dá auditoria completa de graça: quem, quem foi
-- impersonado, quando começou (created_at) e quando terminou (revoked_at).
ALTER TABLE store_user_sessions ADD COLUMN IF NOT EXISTS impersonated_by      UUID REFERENCES store_users(id) ON DELETE SET NULL;
ALTER TABLE store_user_sessions ADD COLUMN IF NOT EXISTS impersonated_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_sus_impersonated_by ON store_user_sessions(impersonated_by) WHERE impersonated_by IS NOT NULL;

-- DOWN (rollback)
-- DROP INDEX IF EXISTS idx_sus_impersonated_by;
-- ALTER TABLE store_user_sessions DROP COLUMN IF EXISTS impersonated_by_name;
-- ALTER TABLE store_user_sessions DROP COLUMN IF EXISTS impersonated_by;

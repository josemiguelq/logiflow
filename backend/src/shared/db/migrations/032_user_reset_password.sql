-- Reset de senha de operador por outro usuário com permissão.
--
-- 1) Concede o novo scope 'users:reset_password' apenas ao papel OWNER nas lojas
--    existentes (cujas linhas store_role_scopes já foram gravadas com a lista antiga),
--    igual ao padrão dos demais scopes 'users:*'. Para conceder a um MANAGER, basta
--    adicionar o scope ao papel pelo editor de scopes do painel.
UPDATE store_role_scopes
SET scopes = scopes || '["users:reset_password"]'::jsonb,
    updated_at = now()
WHERE role = 'OWNER'
  AND NOT (scopes @> '["users:reset_password"]'::jsonb);

-- 2) Auditoria dedicada de resets de senha: quem resetou, de quem e quando.
--    NUNCA armazena a senha nem o hash — apenas o evento. Mesmo padrão de
--    customer_address_audit (021) e assistance_audit (031).
CREATE TABLE IF NOT EXISTS store_user_password_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id)      ON DELETE CASCADE,
  target_user_id  UUID        NOT NULL REFERENCES store_users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL DEFAULT 'PASSWORD_RESET',
  changed_by      UUID        REFERENCES store_users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supa_target ON store_user_password_audit(target_user_id, changed_at DESC);

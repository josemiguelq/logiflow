-- Concede o novo scope 'deliverers:track' aos papéis que já o teriam por padrão
-- (OWNER e MANAGER) nas lojas existentes, cujas linhas de store_role_scopes já
-- foram gravadas com a lista antiga. ASSISTANT não recebe por padrão.
UPDATE store_role_scopes
SET scopes = scopes || '["deliverers:track"]'::jsonb,
    updated_at = now()
WHERE role IN ('OWNER', 'MANAGER')
  AND NOT (scopes @> '["deliverers:track"]'::jsonb);

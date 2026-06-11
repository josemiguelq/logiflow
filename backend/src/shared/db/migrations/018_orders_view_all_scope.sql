-- Concede o novo scope 'orders:view_all' aos papéis que o têm por padrão nas
-- lojas existentes (cujas linhas de store_role_scopes já foram gravadas com a
-- lista antiga). Com ele, ASSISTANT passa a ver todos os pedidos da loja em vez
-- de apenas os que ele mesmo criou. Para reverter, basta remover o scope do
-- papel ASSISTANT no editor de scopes.
UPDATE store_role_scopes
SET scopes = scopes || '["orders:view_all"]'::jsonb,
    updated_at = now()
WHERE role IN ('OWNER', 'MANAGER', 'ASSISTANT')
  AND NOT (scopes @> '["orders:view_all"]'::jsonb);

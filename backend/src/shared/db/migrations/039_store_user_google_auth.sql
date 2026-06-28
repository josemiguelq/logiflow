-- Login com Google para usuários da loja. Vincula a conta Google (google_sub)
-- e permite usuários sem senha (login só via Google).

ALTER TABLE store_users ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- Único, mas permitindo vários NULL (quem usa só senha).
CREATE UNIQUE INDEX IF NOT EXISTS store_users_google_sub_key
  ON store_users (google_sub) WHERE google_sub IS NOT NULL;

-- Usuários só-Google não têm senha.
ALTER TABLE store_users ALTER COLUMN password_hash DROP NOT NULL;

-- DOWN (rollback)
-- ALTER TABLE store_users ALTER COLUMN password_hash SET NOT NULL;
-- DROP INDEX IF EXISTS store_users_google_sub_key;
-- ALTER TABLE store_users DROP COLUMN IF EXISTS google_sub;

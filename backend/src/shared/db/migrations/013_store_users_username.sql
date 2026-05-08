ALTER TABLE store_users ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill existing rows: email prefix + short UUID suffix to guarantee uniqueness
UPDATE store_users
  SET username = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9_.]', '_', 'g'))
             || substr(replace(id::text, '-', ''), 1, 4)
  WHERE username IS NULL;

ALTER TABLE store_users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_users_username ON store_users(username);

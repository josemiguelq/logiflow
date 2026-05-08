-- Features catalog
CREATE TABLE IF NOT EXISTS features (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store ↔ Feature junction
CREATE TABLE IF NOT EXISTS store_features_enabled (
  store_id   UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  feature_id UUID        NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, feature_id)
);

-- Seed canonical features
INSERT INTO features (name, description) VALUES
  ('whatsapp',     'Integração com WhatsApp'),
  ('custom_theme', 'Customização de cores e logo'),
  ('csv_export',   'Download de CSV de pedidos e rotas')
ON CONFLICT (name) DO NOTHING;

-- Migrate existing store_features booleans → junction table
INSERT INTO store_features_enabled (store_id, feature_id)
SELECT sf.store_id, f.id
FROM store_features sf
CROSS JOIN features f
WHERE (f.name = 'whatsapp'     AND sf.whatsapp_enabled     = true)
   OR (f.name = 'custom_theme' AND sf.custom_theme_enabled = true)
ON CONFLICT DO NOTHING;

-- Fix MANAGER scopes: remove whatsapp:view and whatsapp:connect
UPDATE store_role_scopes
SET scopes = (
  SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
  FROM jsonb_array_elements_text(scopes) AS t(s)
  WHERE s NOT IN ('whatsapp:view', 'whatsapp:connect')
)
WHERE role = 'MANAGER';

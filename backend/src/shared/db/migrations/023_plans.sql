-- ─── plans (catalog, configurável pelo super-admin) ─────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,
  price_cents          INTEGER NOT NULL DEFAULT 0,
  max_deliverers       INTEGER,          -- NULL = ilimitado
  max_orders_per_month INTEGER,          -- NULL = ilimitado
  sort_order           INTEGER NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── plan_features (plano ↔ feature do catálogo) ────────────────────────────
CREATE TABLE IF NOT EXISTS plan_features (
  plan_id    UUID NOT NULL REFERENCES plans(id)    ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, feature_id)
);

-- ─── atribuição + override por loja ─────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_deliverers_override       INTEGER,  -- NULL = herda do plano; 0 = ilimitado
  ADD COLUMN IF NOT EXISTS max_orders_per_month_override INTEGER;  -- idem

-- ─── seed: planos da landing ────────────────────────────────────────────────
INSERT INTO plans (name, price_cents, max_deliverers, max_orders_per_month, sort_order) VALUES
  ('Starter',            5000,  2,    1000, 1),
  ('Starter + WhatsApp', 6000,  2,    1000, 2),
  ('Pro',                8000,  4,    NULL, 3),
  ('Pro + WhatsApp',     10000, 4,    NULL, 4),
  ('Pro Premium',        12000, NULL, NULL, 5)
ON CONFLICT (name) DO NOTHING;

-- ─── seed: features incluídas em cada plano ─────────────────────────────────
-- Starter + WhatsApp → whatsapp
INSERT INTO plan_features (plan_id, feature_id)
SELECT p.id, f.id FROM plans p, features f
WHERE p.name = 'Starter + WhatsApp' AND f.name IN ('whatsapp')
ON CONFLICT DO NOTHING;

-- Pro → custom_theme(não), csv_export, customer_ratings (foto é setting, fora do catálogo)
INSERT INTO plan_features (plan_id, feature_id)
SELECT p.id, f.id FROM plans p, features f
WHERE p.name = 'Pro' AND f.name IN ('csv_export', 'customer_ratings')
ON CONFLICT DO NOTHING;

-- Pro + WhatsApp → csv_export, customer_ratings, whatsapp
INSERT INTO plan_features (plan_id, feature_id)
SELECT p.id, f.id FROM plans p, features f
WHERE p.name = 'Pro + WhatsApp' AND f.name IN ('csv_export', 'customer_ratings', 'whatsapp')
ON CONFLICT DO NOTHING;

-- Pro Premium → csv_export, customer_ratings, whatsapp, custom_theme
INSERT INTO plan_features (plan_id, feature_id)
SELECT p.id, f.id FROM plans p, features f
WHERE p.name = 'Pro Premium' AND f.name IN ('csv_export', 'customer_ratings', 'whatsapp', 'custom_theme')
ON CONFLICT DO NOTHING;

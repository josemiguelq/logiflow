-- "Garantias" passa a ser uma feature controlada pelo superadmin.
-- Desativada por padrão: só aparece no menu e funciona nas lojas em que o
-- superadmin habilitar (via store_features_enabled), como o WhatsApp.

INSERT INTO features (name, description) VALUES
  ('warranties', 'Módulo de Garantias: termos, versões e assinatura do cliente')
ON CONFLICT (name) DO NOTHING;

-- DOWN
-- DELETE FROM store_features_enabled WHERE feature_id = (SELECT id FROM features WHERE name = 'warranties');
-- DELETE FROM features WHERE name = 'warranties';

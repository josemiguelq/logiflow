-- Chat do pedido passa a ser uma feature controlada pelo superadmin (como o
-- WhatsApp/Garantias): só funciona nas lojas em que estiver habilitada em
-- store_features_enabled.
INSERT INTO features (name, description) VALUES
  ('chat', 'Chat do pedido entre operador e entregador')
ON CONFLICT (name) DO NOTHING;

-- Grandfather: habilita o chat para todas as lojas existentes, para ninguém que
-- já usa perder o acesso. Novas lojas começam sem — o superadmin habilita.
INSERT INTO store_features_enabled (store_id, feature_id)
SELECT s.id, f.id FROM stores s CROSS JOIN features f
WHERE f.name = 'chat'
ON CONFLICT (store_id, feature_id) DO NOTHING;

-- DOWN
-- DELETE FROM store_features_enabled WHERE feature_id = (SELECT id FROM features WHERE name = 'chat');
-- DELETE FROM features WHERE name = 'chat';

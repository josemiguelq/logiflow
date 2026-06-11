-- Quantos pedidos atrasados (aguardando retirada) disparam o alerta sonoro do
-- operador no painel. Configurável por loja via store_setting_values.
INSERT INTO settings (name, default_value) VALUES
  ('notify_operator_delayed_threshold', '3')
ON CONFLICT (name) DO NOTHING;

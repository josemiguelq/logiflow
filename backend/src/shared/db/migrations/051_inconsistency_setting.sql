-- Notificação de inconsistência (entrega fora do local / valor a menor) passa a
-- ser um ajuste da loja: o operador liga/desliga o popup nas configurações.
-- Ligada por padrão.
INSERT INTO settings (name, default_value) VALUES
  ('inconsistency_notify_enabled', 'true')
ON CONFLICT (name) DO NOTHING;

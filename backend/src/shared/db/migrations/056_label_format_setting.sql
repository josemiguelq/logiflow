-- Formato da etiqueta de impressão do pedido (config fixa da loja).
-- Valores: 'a4' | 'thermal80' | 'thermal58'. Padrão: térmica 80mm.
INSERT INTO settings (name, default_value) VALUES
  ('label_format', 'thermal80')
ON CONFLICT (name) DO NOTHING;

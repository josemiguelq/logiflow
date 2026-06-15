-- Registra o instante em que o entregador entrou no raio de chegada do endereço
-- do pedido (para medir o tempo entre chegar e marcar como entregue).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- Raio (em metros) para considerar que o entregador "chegou" ao endereço do
-- pedido. Independente do raio de proximidade exigido para concluir a entrega.
INSERT INTO settings (name, default_value) VALUES
  ('arrival_radius_meters', '20')
ON CONFLICT (name) DO NOTHING;

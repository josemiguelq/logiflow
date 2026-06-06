-- Regras de entrega configuráveis por loja:
-- - delivery_proximity_meters: raio (m) em que o entregador é considerado "perto".
-- - delivery_require_proximity: se 'true', bloqueia a entrega quando longe; se 'false',
--   apenas avisa no app (o entregador pode confirmar mesmo assim).
-- - enforce_delivery_order: se 'true', obriga seguir a ordem da rota (não pular paradas).
INSERT INTO settings (name, default_value) VALUES
  ('delivery_proximity_meters',  '100'),
  ('delivery_require_proximity', 'false'),
  ('enforce_delivery_order',     'false')
ON CONFLICT (name) DO NOTHING;

-- Tempos (em minutos) das bandeiras de atraso, configuráveis por loja.
-- As bandeiras em si são virtuais (calculadas com base em now()); aqui só guardamos
-- os limiares no catálogo de settings, com override por loja em store_setting_values.
INSERT INTO settings (name, default_value) VALUES
  ('delay_prep_yellow_min',    '20'),
  ('delay_prep_red_min',       '30'),
  ('delay_transit_yellow_min', '50'),
  ('delay_transit_red_min',    '60')
ON CONFLICT (name) DO NOTHING;

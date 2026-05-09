INSERT INTO features (name, description)
VALUES ('customer_ratings', 'Permite que clientes avaliem a entrega com até 5 estrelas')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS allow_customer_ratings BOOLEAN NOT NULL DEFAULT false;

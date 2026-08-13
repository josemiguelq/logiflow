-- Entrega terceirizada ("via agência/parceiro"): o pedido é levado pelo entregador
-- da loja até um ponto de terceiro (ex.: agência dos Correios), não ao endereço do
-- cliente. A marcação vive no CLIENTE; cada pedido criado herda o valor no momento
-- da criação (snapshot em orders.third_party_delivery).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS third_party_delivery BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS third_party_delivery BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial para o filtro "Via agência" na tela Em Andamento.
CREATE INDEX IF NOT EXISTS idx_orders_third_party
  ON orders (store_id, third_party_delivery) WHERE third_party_delivery;

-- DOWN (rollback)
-- DROP INDEX IF EXISTS idx_orders_third_party;
-- ALTER TABLE orders    DROP COLUMN IF EXISTS third_party_delivery;
-- ALTER TABLE customers DROP COLUMN IF EXISTS third_party_delivery;

-- Adiciona vínculo com a tabela clientes (customer_id) na garantia.
-- O customer_name continua sendo salvo como snapshot no momento da criação.
-- Usar JOIN com customers para buscar pelo nome do cliente na listagem.

ALTER TABLE warranties
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warranties_customer ON warranties(customer_id);

-- DOWN
-- ALTER TABLE warranties DROP COLUMN IF EXISTS customer_id;

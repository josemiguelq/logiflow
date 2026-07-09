-- Permite múltiplos pagamentos por entrega (ex.: R$50 no Pix + R$100 em dinheiro).
-- Substitui as colunas desnormalizadas collected_amount/collected_method (036) por
-- uma tabela dedicada, uma linha por pagamento recebido, com auditoria.

CREATE TABLE IF NOT EXISTS order_payments (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method      TEXT          NOT NULL CHECK (method IN ('cash','pix','card')),
  created_by  UUID          REFERENCES deliverers(id),   -- auditoria: quem recebeu
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

-- backfill dos dados existentes (colunas mortas hoje, mas preserva o histórico)
INSERT INTO order_payments (order_id, amount, method, created_by, created_at)
SELECT o.id, o.collected_amount,
       COALESCE(o.collected_method, 'cash'),
       o.deliverer_id, COALESCE(o.delivered_at, now())
FROM orders o
WHERE o.collected_amount IS NOT NULL AND o.collected_amount > 0;

-- remover colunas antigas (substituídas pela tabela)
ALTER TABLE orders DROP COLUMN IF EXISTS collected_amount;
ALTER TABLE orders DROP COLUMN IF EXISTS collected_method;

-- DOWN (rollback)
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10,2);
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_method TEXT
--   CHECK (collected_method IN ('cash', 'pix', 'card'));
-- DROP TABLE IF EXISTS order_payments;

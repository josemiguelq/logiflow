-- O UNIQUE original de proof_of_delivery(order_id) foi removido na 010_multi_proof,
-- deixando os lookups por order_id (subquery de proofs no GET /orders e no fluxo de
-- entrega) como seq scan. Recria um índice dedicado.
-- CONCURRENTLY: não trava escritas na tabela durante o deploy. IMPORTANTE: este
-- arquivo deve conter APENAS este comando (CONCURRENTLY não roda em transação).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proof_order ON proof_of_delivery (order_id);

-- DOWN (rollback)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_proof_order;

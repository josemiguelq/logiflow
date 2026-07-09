-- Torna a inserção de comprovantes idempotente: o endpoint de entrega pode ser
-- reenviado (timeout no app + novo toque em "Confirmar"), duplicando linhas em
-- proof_of_delivery. O storage usa caminho determinístico, então não duplica.

-- 1) remover duplicatas já existentes, mantendo a linha mais antiga por (order_id, photo_index)
DELETE FROM proof_of_delivery p
USING proof_of_delivery q
WHERE p.order_id = q.order_id
  AND p.photo_index = q.photo_index
  AND p.ctid > q.ctid;

-- 2) impede futuras duplicatas no mesmo índice de foto
ALTER TABLE proof_of_delivery
  ADD CONSTRAINT proof_of_delivery_order_photo_idx_key UNIQUE (order_id, photo_index);

-- DOWN (rollback)
-- ALTER TABLE proof_of_delivery DROP CONSTRAINT IF EXISTS proof_of_delivery_order_photo_idx_key;

-- Cloud API entrega webhooks de status: sent → delivered → read (ou failed).
-- Estende o enum message_status para registrar entrega/leitura em message_logs.
-- (ADD VALUE não pode ser usado na MESMA transação em que é criado; aqui só
-- adicionamos — o uso acontece em migrations/queries posteriores.)
ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'READ';

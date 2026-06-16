-- Guarda o id da mensagem no WhatsApp (key.id do Baileys) para conseguir
-- responder a retry receipts depois de um restart: o getMessage reconstrói a
-- mensagem a partir do texto salvo em message_logs.message.
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_message_logs_wa_id ON message_logs(wa_message_id);

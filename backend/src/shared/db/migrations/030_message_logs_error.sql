-- Guarda a mensagem de erro quando o envio falha, para auditoria/diagnóstico:
-- saber POR QUE uma mensagem não foi enviada (provider desconectado, número
-- inválido, timeout, etc.) sem depender só dos logs da aplicação.
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS error TEXT;

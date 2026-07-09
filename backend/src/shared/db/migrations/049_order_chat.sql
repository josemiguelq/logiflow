-- Chat do pedido: mensagens trocadas entre o operador (painel) e o entregador (app).
-- Append-only e imutável — o próprio registro serve de auditoria (quem/quando/o quê).
-- Reusa o scope orders:view (sem novo scope). Não altera fluxos existentes.

CREATE TABLE IF NOT EXISTS order_messages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID        NOT NULL REFERENCES orders(id)     ON DELETE CASCADE,
  store_id             UUID        NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  deliverer_id         UUID        REFERENCES deliverers(id)          ON DELETE SET NULL,
  sender_type          TEXT        NOT NULL CHECK (sender_type IN ('store_user','deliverer')),
  sender_id            UUID        NOT NULL,
  sender_name          TEXT        NOT NULL,
  body                 TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_by_store_at     TIMESTAMPTZ,
  read_by_deliverer_at TIMESTAMPTZ
);

-- Histórico da conversa de um pedido em ordem cronológica.
CREATE INDEX IF NOT EXISTS idx_order_messages_order
  ON order_messages(order_id, created_at);

-- Não-lidas do painel: mensagens do entregador ainda não lidas pelo operador.
CREATE INDEX IF NOT EXISTS idx_order_messages_store_unread
  ON order_messages(store_id)
  WHERE sender_type = 'deliverer' AND read_by_store_at IS NULL;

-- DOWN (rollback) — manter comentado (convenção do repo)
-- DROP TABLE IF EXISTS order_messages;

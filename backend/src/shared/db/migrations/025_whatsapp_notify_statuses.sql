-- Quais status de pedido disparam notificação por WhatsApp ao cliente.
-- Armazenado como JSON (TEXT) em settings/store_setting_values, igual aos demais.
-- Default: todos os status voltados ao cliente (preserva o comportamento atual).
INSERT INTO settings (name, default_value) VALUES
  ('whatsapp_notify_statuses',
   '["PREPARING","ON_ROUTE","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","ADDRESS_CHANGED"]')
ON CONFLICT (name) DO NOTHING;

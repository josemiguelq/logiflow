INSERT INTO settings (name, default_value) VALUES ('payment_methods_enabled', 'false')
ON CONFLICT DO NOTHING;

-- Username do entregador passa a ser único POR LOJA (não mais global), para que
-- o mesmo username (ex.: carlos.moto) possa existir em lojas diferentes.
-- A v1 do login (busca global por username) permanece intocada.
ALTER TABLE deliverers DROP CONSTRAINT IF EXISTS deliverers_username_key;

DO $$ BEGIN
  ALTER TABLE deliverers ADD CONSTRAINT deliverers_store_username_key UNIQUE (store_id, username);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

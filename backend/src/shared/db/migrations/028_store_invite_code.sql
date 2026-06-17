-- Código de convite da loja: identificador curto que o entregador digita no app
-- (login v2) para selecionar a loja. Gerado automaticamente para toda loja.

-- Gera um código de 6 chars (mesmo alfabeto de shared/utils/code-generator.ts,
-- sem caracteres ambíguos: I, O, L, 0, 1).
CREATE OR REPLACE FUNCTION gen_store_invite_code() RETURNS TEXT AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i      INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Backfill: atribui um código único a cada loja que ainda não tem.
DO $$
DECLARE
  r    RECORD;
  code TEXT;
BEGIN
  FOR r IN SELECT id FROM stores WHERE invite_code IS NULL LOOP
    LOOP
      code := gen_store_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM stores WHERE invite_code = code);
    END LOOP;
    UPDATE stores SET invite_code = code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE stores ALTER COLUMN invite_code SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE stores ADD CONSTRAINT stores_invite_code_key UNIQUE (invite_code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Preenche invite_code automaticamente em qualquer INSERT que não informe um
-- (cobre cadastro, super-admin e seeds sem alterar cada ponto de criação).
CREATE OR REPLACE FUNCTION set_store_invite_code() RETURNS TRIGGER AS $$
DECLARE
  code TEXT;
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      code := gen_store_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM stores WHERE invite_code = code);
    END LOOP;
    NEW.invite_code := code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_store_invite_code ON stores;
CREATE TRIGGER trg_set_store_invite_code
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION set_store_invite_code();

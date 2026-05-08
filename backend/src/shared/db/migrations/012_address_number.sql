ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS number TEXT;

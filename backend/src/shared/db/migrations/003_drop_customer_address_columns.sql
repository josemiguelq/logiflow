-- Drop legacy address columns from customers table.
-- Address data lives in customer_addresses; these columns are no longer used.
ALTER TABLE customers
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS number,
  DROP COLUMN IF EXISTS complement,
  DROP COLUMN IF EXISTS lat,
  DROP COLUMN IF EXISTS lng;

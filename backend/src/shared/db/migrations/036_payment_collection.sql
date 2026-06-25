ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS collected_method TEXT
    CHECK (collected_method IN ('cash', 'pix', 'card'));

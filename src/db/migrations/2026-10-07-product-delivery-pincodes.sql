-- Add delivery_pincodes to products table
-- Empty array = available everywhere (same semantics as available_cities).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS delivery_pincodes text[] NOT NULL DEFAULT '{}';

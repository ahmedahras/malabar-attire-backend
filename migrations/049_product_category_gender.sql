-- Add gender to product categories for gender filtering.
-- Safe to run multiple times.
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- Backfill existing categories based on name.
-- Note: we avoid naive '%Men%' matching because it also matches 'Women'.
UPDATE product_categories
SET gender = 'MEN'
WHERE gender IS NULL
  AND (
    name ILIKE 'Men %'
    OR name ILIKE 'Mens %'
    OR name ILIKE 'Men''s %'
    OR name ILIKE '% Men %'
    OR name ILIKE '% Men'
    OR name ILIKE 'Men'
  );

UPDATE product_categories
SET gender = 'WOMEN'
WHERE gender IS NULL
  AND (
    name ILIKE 'Women %'
    OR name ILIKE 'Womens %'
    OR name ILIKE 'Women''s %'
    OR name ILIKE '% Women %'
    OR name ILIKE '% Women'
    OR name ILIKE 'Women'
  );

UPDATE product_categories
SET gender = 'KIDS'
WHERE gender IS NULL
  AND (
    name ILIKE 'Kids %'
    OR name ILIKE '% Kids %'
    OR name ILIKE '% Kids'
    OR name ILIKE 'Kids'
  );

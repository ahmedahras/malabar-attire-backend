-- Allow KIDS as a gender and add kids sections.
-- Safe to run multiple times.

-- Ensure column exists
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- Update gender constraint to allow MEN/WOMEN/KIDS (or NULL)
ALTER TABLE product_categories
  DROP CONSTRAINT IF EXISTS product_categories_gender_check;

ALTER TABLE product_categories
  ADD CONSTRAINT product_categories_gender_check
  CHECK (gender IN ('MEN', 'WOMEN', 'KIDS') OR gender IS NULL);

-- Insert kids sections
INSERT INTO product_categories (name, slug, type, gender)
VALUES
  ('Kids Casual', 'kids-casual', 'SECTION', 'KIDS'),
  ('Kids Party', 'kids-party', 'SECTION', 'KIDS'),
  ('Kids Ethnic', 'kids-ethnic', 'SECTION', 'KIDS')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  gender = EXCLUDED.gender;


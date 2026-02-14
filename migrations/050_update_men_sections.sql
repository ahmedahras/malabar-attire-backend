-- Update men category sections to new set.
-- Safe to run multiple times.

-- 1) Remove old men categories
DELETE FROM product_categories
WHERE slug IN ('men-ethnic', 'men-party');

-- 2) Add / update new men categories
INSERT INTO product_categories (name, slug, type, gender)
VALUES
  ('Men Jeans', 'men-jeans', 'SECTION', 'MEN'),
  ('Men T-Shirts', 'men-tshirt', 'SECTION', 'MEN')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  gender = EXCLUDED.gender;

-- Ensure existing men sections remain correct
UPDATE product_categories
SET type = 'SECTION', gender = 'MEN'
WHERE slug IN ('men-casual', 'men-formal');


-- Remove old unwanted categories
DELETE FROM product_category_map
WHERE category_id IN (
  SELECT id FROM product_categories
  WHERE slug IN ('men-ethnic','men-party')
);

DELETE FROM product_categories
WHERE slug IN ('men-ethnic','men-party');

-- Add new correct categories
INSERT INTO product_categories (name, slug, type, gender)
VALUES
('Men Jeans','men-jeans','SECTION','MEN'),
('Men T-Shirts','men-tshirt','SECTION','MEN')
ON CONFLICT (slug) DO NOTHING;

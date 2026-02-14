-- Add hierarchy support for product categories (Kids).
-- Safe to run multiple times.

-- 1) Add parent_id column
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES product_categories(id) ON DELETE CASCADE;

-- 2) Remove old kids categories (flat)
DELETE FROM product_categories
WHERE slug IN ('kids-casual', 'kids-party', 'kids-ethnic');

-- 3) Create Kids Boy & Kids Girl (Level 2)
INSERT INTO product_categories (id, name, slug, type, gender)
VALUES
  (gen_random_uuid(), 'Kids Boy', 'kids-boy', 'SECTION', 'KIDS'),
  (gen_random_uuid(), 'Kids Girl', 'kids-girl', 'SECTION', 'KIDS')
ON CONFLICT (slug) DO NOTHING;

-- 4) Insert Age Groups (Level 3)
-- Kids Boy Ages
INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Boy Toddler (0-2)', 'boy-toddler', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-boy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Boy Little Kids (3-5)', 'boy-little-kids', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-boy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Boy Kids (6-9)', 'boy-kids', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-boy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Boy Pre-Teens (10-14)', 'boy-pre-teens', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-boy'
ON CONFLICT (slug) DO NOTHING;

-- Kids Girl Ages
INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Girl Toddler (0-2)', 'girl-toddler', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-girl'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Girl Little Kids (3-5)', 'girl-little-kids', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-girl'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Girl Kids (6-9)', 'girl-kids', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-girl'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_categories (name, slug, type, gender, parent_id)
SELECT 'Girl Pre-Teens (10-14)', 'girl-pre-teens', 'SECTION', 'KIDS', id
FROM product_categories
WHERE slug = 'kids-girl'
ON CONFLICT (slug) DO NOTHING;


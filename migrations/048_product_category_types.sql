ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SECTION';

UPDATE product_categories
SET type = CASE slug
  WHEN 'women-ethnic' THEN 'SECTION'
  WHEN 'women-western' THEN 'SECTION'
  WHEN 'women-party' THEN 'SECTION'
  WHEN 'women-modest' THEN 'SECTION'
  WHEN 'men-ethnic' THEN 'SECTION'
  WHEN 'men-casual' THEN 'SECTION'
  WHEN 'men-formal' THEN 'SECTION'
  WHEN 'men-party' THEN 'SECTION'
  ELSE type
END;

INSERT INTO product_categories (name, slug, type)
VALUES
  ('Ethnic Wear', 'section-ethnic-wear', 'SECTION'),
  ('Western Wear', 'section-western-wear', 'SECTION'),
  ('Party Wear', 'section-party-wear', 'SECTION'),
  ('Eid Collection', 'collection-eid', 'COLLECTION'),
  ('Wedding Collection', 'collection-wedding', 'COLLECTION')
ON CONFLICT (slug) DO NOTHING;

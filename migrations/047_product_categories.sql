-- Product categories (tag-based sections)
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_category_map (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_category_map_category
  ON product_category_map(category_id);
CREATE INDEX IF NOT EXISTS idx_product_category_map_product
  ON product_category_map(product_id);

INSERT INTO product_categories (name, slug)
VALUES
  ('Women Ethnic', 'women-ethnic'),
  ('Women Western', 'women-western'),
  ('Women Party', 'women-party'),
  ('Women Modest', 'women-modest'),
  ('Men Ethnic', 'men-ethnic'),
  ('Men Casual', 'men-casual'),
  ('Men Formal', 'men-formal'),
  ('Men Party', 'men-party')
ON CONFLICT (slug) DO NOTHING;

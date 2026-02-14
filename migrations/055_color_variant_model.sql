-- Color-based variant model with dynamic sizes.
-- Safe to run multiple times (idempotent where possible).

-- 1) New tables
CREATE TABLE IF NOT EXISTS product_variant_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name TEXT NOT NULL,
  color_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, color_name)
);

CREATE TABLE IF NOT EXISTS product_variant_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_color_id UUID NOT NULL REFERENCES product_variant_colors(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  UNIQUE (variant_color_id, size)
);

CREATE INDEX IF NOT EXISTS idx_variant_colors_product ON product_variant_colors(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_sizes_color ON product_variant_sizes(variant_color_id);

-- 2) Backfill from legacy product_variants (size/color/stock) if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'product_variants'
  ) THEN
    INSERT INTO product_variant_colors (product_id, color_name, color_image_url)
    SELECT
      pv.product_id,
      COALESCE(NULLIF(TRIM(pv.color), ''), 'Default') AS color_name,
      MAX(pv.image_url) AS color_image_url
    FROM product_variants pv
    GROUP BY pv.product_id, COALESCE(NULLIF(TRIM(pv.color), ''), 'Default')
    ON CONFLICT (product_id, color_name) DO UPDATE
      SET color_image_url = COALESCE(EXCLUDED.color_image_url, product_variant_colors.color_image_url);

    INSERT INTO product_variant_sizes (variant_color_id, size, stock)
    SELECT
      pvc.id,
      pv.size,
      COALESCE(SUM(pv.stock), 0)::int AS stock
    FROM product_variants pv
    INNER JOIN product_variant_colors pvc
      ON pvc.product_id = pv.product_id
     AND pvc.color_name = COALESCE(NULLIF(TRIM(pv.color), ''), 'Default')
    GROUP BY pvc.id, pv.size
    ON CONFLICT (variant_color_id, size) DO UPDATE
      SET stock = EXCLUDED.stock;
  END IF;
END$$;

-- 3) Replace product_stock_summary to aggregate from product_variant_sizes
DROP FUNCTION IF EXISTS refresh_product_stock_summary();
DROP MATERIALIZED VIEW IF EXISTS product_stock_summary;

CREATE MATERIALIZED VIEW IF NOT EXISTS product_stock_summary AS
SELECT
  pvc.product_id,
  COALESCE(SUM(pvs.stock), 0)::int AS total_stock
FROM product_variant_colors pvc
INNER JOIN product_variant_sizes pvs ON pvs.variant_color_id = pvc.id
GROUP BY pvc.product_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_stock_summary_product
  ON product_stock_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_summary_total
  ON product_stock_summary(total_stock);

CREATE OR REPLACE FUNCTION refresh_product_stock_summary() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_stock_summary;
END;
$$ LANGUAGE plpgsql;

-- 4) Update cart_items schema to store variant_color_id + size
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS variant_color_id UUID,
  ADD COLUMN IF NOT EXISTS size TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'product_variant_id'
  ) THEN
    UPDATE cart_items ci
    SET
      variant_color_id = pvc.id,
      size = pv.size
    FROM product_variants pv
    INNER JOIN product_variant_colors pvc
      ON pvc.product_id = pv.product_id
     AND pvc.color_name = COALESCE(NULLIF(TRIM(pv.color), ''), 'Default')
    WHERE ci.product_variant_id = pv.id
      AND (ci.variant_color_id IS NULL OR ci.size IS NULL);
  END IF;
END$$;

-- Enforce not null after backfill (if any rows exist)
ALTER TABLE cart_items
  ALTER COLUMN variant_color_id SET NOT NULL,
  ALTER COLUMN size SET NOT NULL;

-- Replace unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_id_product_variant_id_key'
  ) THEN
    ALTER TABLE cart_items DROP CONSTRAINT cart_items_cart_id_product_variant_id_key;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_variant_size
  ON cart_items(cart_id, variant_color_id, size);

-- Drop legacy FK + column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'product_variant_id'
  ) THEN
    ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_product_variant_id_fkey;
    ALTER TABLE cart_items DROP COLUMN product_variant_id;
  END IF;
END$$;

-- 5) Update cart_item_reservations
ALTER TABLE cart_item_reservations
  ADD COLUMN IF NOT EXISTS variant_color_id UUID,
  ADD COLUMN IF NOT EXISTS size TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'cart_item_reservations' AND column_name = 'product_variant_id'
  ) THEN
    UPDATE cart_item_reservations cir
    SET
      variant_color_id = pvc.id,
      size = pv.size
    FROM product_variants pv
    INNER JOIN product_variant_colors pvc
      ON pvc.product_id = pv.product_id
     AND pvc.color_name = COALESCE(NULLIF(TRIM(pv.color), ''), 'Default')
    WHERE cir.product_variant_id = pv.id
      AND (cir.variant_color_id IS NULL OR cir.size IS NULL);
  END IF;
END$$;

ALTER TABLE cart_item_reservations
  ALTER COLUMN variant_color_id SET NOT NULL,
  ALTER COLUMN size SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_item_reservations' AND column_name = 'product_variant_id'
  ) THEN
    ALTER TABLE cart_item_reservations DROP CONSTRAINT IF EXISTS cart_item_reservations_product_variant_id_fkey;
    ALTER TABLE cart_item_reservations DROP COLUMN product_variant_id;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_cart_reservations_variant_color
  ON cart_item_reservations(variant_color_id);

-- 6) Update order_items to store variant_color_id, keep size/color columns
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_color_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'product_variant_id'
  ) THEN
    UPDATE order_items oi
    SET variant_color_id = pvc.id
    FROM product_variants pv
    INNER JOIN product_variant_colors pvc
      ON pvc.product_id = pv.product_id
     AND pvc.color_name = COALESCE(NULLIF(TRIM(pv.color), ''), 'Default')
    WHERE oi.product_variant_id = pv.id
      AND oi.variant_color_id IS NULL;

    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_variant_id_fkey;
    ALTER TABLE order_items DROP COLUMN product_variant_id;
  END IF;
END$$;

ALTER TABLE order_items
  ALTER COLUMN variant_color_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variant_color
  ON order_items(variant_color_id);

-- 7) Drop legacy product_variants
DROP TABLE IF EXISTS product_variants;


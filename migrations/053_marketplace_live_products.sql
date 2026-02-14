-- Open marketplace: make products live via is_active.
-- Safe to run multiple times.

-- Add is_active (backfill from existing lifecycle fields if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE products ADD COLUMN is_active BOOLEAN;

    -- If lifecycle columns exist, preserve current "live & approved" as active
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'status'
    ) THEN
      UPDATE products
      SET is_active = (status = 'LIVE' AND is_approved = TRUE)
      WHERE is_active IS NULL;
    ELSE
      UPDATE products
      SET is_active = is_approved
      WHERE is_active IS NULL;
    END IF;

    ALTER TABLE products ALTER COLUMN is_active SET DEFAULT TRUE;
    ALTER TABLE products ALTER COLUMN is_active SET NOT NULL;
  END IF;
END $$;

-- Add slug (unique) and backfill with id string
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'slug'
  ) THEN
    ALTER TABLE products ADD COLUMN slug TEXT;
    UPDATE products SET slug = id::text WHERE slug IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug);
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status') THEN
    CREATE TYPE product_status AS ENUM ('DRAFT', 'IN_REVIEW', 'LIVE', 'BLOCKED', 'OUT_OF_STOCK');
  END IF;
END$$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS quality_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_flagged_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE TABLE IF NOT EXISTS product_quality_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  flags JSONB NOT NULL,
  note TEXT,
  actor_type TEXT NOT NULL,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_quality_flags_product ON product_quality_flags(product_id);
CREATE INDEX IF NOT EXISTS idx_product_quality_flags_created ON product_quality_flags(created_at DESC);

UPDATE products
SET status = 'LIVE',
    approved_at = COALESCE(approved_at, NOW()),
    published_at = COALESCE(published_at, NOW())
WHERE is_approved = TRUE
  AND status = 'DRAFT';

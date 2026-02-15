-- Carts
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, status)
);

-- Cart items with price + product snapshots
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_snapshot NUMERIC(12, 2) NOT NULL,
  total_price_snapshot NUMERIC(12, 2) NOT NULL,
  product_snapshot JSONB NOT NULL,
  variant_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_variant_id)
);

-- Optional reservation table for short-lived stock holds
CREATE TABLE IF NOT EXISTS cart_item_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_item_id UUID NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  reserved_qty INTEGER NOT NULL CHECK (reserved_qty > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'consumed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status);
CREATE INDEX IF NOT EXISTS idx_carts_updated ON carts(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cart_items'
      AND column_name = 'product_variant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items(product_variant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cart_item_reservations'
      AND column_name = 'product_variant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_cart_reservations_variant ON cart_item_reservations(product_variant_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_cart_reservations_status ON cart_item_reservations(status);
CREATE INDEX IF NOT EXISTS idx_cart_reservations_expires ON cart_item_reservations(expires_at);

-- Strategy notes:
-- 1) Cart is a soft-hold; true stock lock happens at checkout using
--    SELECT ... FOR UPDATE on product_variants, then decrement stock.
-- 2) Optional: create cart_item_reservations rows on add-to-cart with
--    short TTL (expires_at) and clean via cron; enforce at checkout
--    by consuming reservations before decrement.

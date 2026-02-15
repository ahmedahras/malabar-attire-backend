-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('customer', 'shop_owner', 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'pending',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    );
  END IF;
END$$;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shops
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  district TEXT NOT NULL,
  address TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  orders_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  district TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  size_chart JSONB,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  priority_score NUMERIC(12, 4) NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product variants (size-wise stock)
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  color TEXT,
  sku TEXT,
  price_override NUMERIC(12, 2),
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, size, color)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'razorpay')),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  subtotal_amount NUMERIC(12, 2) NOT NULL,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL,
  shipping_address JSONB NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  size TEXT,
  color TEXT,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for filtering and performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_shops_district ON shops(district);
CREATE INDEX IF NOT EXISTS idx_shops_approved ON shops(is_approved, approved_at);

CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_district ON products(district);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_products_priority ON products(priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_size ON product_variants(size);
CREATE INDEX IF NOT EXISTS idx_variants_color ON product_variants(color);
CREATE INDEX IF NOT EXISTS idx_variants_in_stock ON product_variants(stock) WHERE stock > 0;

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'product_variant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(product_variant_id);
  END IF;
END $$;

-- Materialized stock summary (refresh with job/cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS product_stock_summary AS
SELECT
  product_id,
  SUM(stock) AS total_stock
FROM product_variants
GROUP BY product_id;

-- Indexes for fast filtering on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_stock_summary_product
  ON product_stock_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_summary_total
  ON product_stock_summary(total_stock);

-- Refresh helper (run via background job / cron)
CREATE OR REPLACE FUNCTION refresh_product_stock_summary() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_stock_summary;
END;
$$ LANGUAGE plpgsql;

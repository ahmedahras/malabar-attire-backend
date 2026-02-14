CREATE TABLE IF NOT EXISTS product_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CONVERTED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_reservations
  ON product_reservations(product_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('INITIATED', 'COMPLETED', 'FAILED')),
  gateway_reference TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_status
  ON order_refunds(status, created_at DESC);

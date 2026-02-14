CREATE TABLE IF NOT EXISTS order_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('CREATED', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')
  ),
  source TEXT NOT NULL CHECK (
    source IN ('webhook', 'manual', 'reconciliation', 'system')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_timeline_order
  ON order_timeline(order_id, created_at DESC);

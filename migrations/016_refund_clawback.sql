ALTER TABLE seller_balance
  ADD COLUMN IF NOT EXISTS reserve_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS refund_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('REFUND', 'CHARGEBACK', 'MANUAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_adjustments_seller
  ON refund_adjustments(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_adjustments_order
  ON refund_adjustments(order_id);

-- Extend order_timeline event types for financial adjustments
ALTER TABLE order_timeline
  DROP CONSTRAINT IF EXISTS order_timeline_event_type_check;
ALTER TABLE order_timeline
  ADD CONSTRAINT order_timeline_event_type_check
  CHECK (event_type IN ('CREATED', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'PAYOUT', 'ADJUSTMENT'));

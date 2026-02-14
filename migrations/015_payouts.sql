CREATE TABLE IF NOT EXISTS seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  reference_id TEXT,
  cycle_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_payouts_cycle
  ON seller_payouts(seller_id, cycle_key);

-- Track which orders were paid out
ALTER TABLE order_financials
  ADD COLUMN IF NOT EXISTS paid_out_at TIMESTAMPTZ;

-- Extend order_timeline event types for payout logging
ALTER TABLE order_timeline
  DROP CONSTRAINT IF EXISTS order_timeline_event_type_check;
ALTER TABLE order_timeline
  ADD CONSTRAINT order_timeline_event_type_check
  CHECK (event_type IN ('CREATED', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'PAYOUT'));

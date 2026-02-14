ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_eligible_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_window_expired BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_return_window
  ON orders(return_eligible_until)
  WHERE return_window_expired = FALSE;

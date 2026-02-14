CREATE TABLE IF NOT EXISTS platform_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES seller_payouts(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('REVENUE', 'ADJUSTMENT')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_ledger_created_at
  ON platform_ledger(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_ledger_seller
  ON platform_ledger(seller_id);

-- Ensures one explicit revenue entry per payout.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_ledger_unique_revenue_payout
  ON platform_ledger(payout_id)
  WHERE type = 'REVENUE' AND payout_id IS NOT NULL;

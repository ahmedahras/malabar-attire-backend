CREATE TABLE IF NOT EXISTS seller_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  payout_id UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_ledger_credit_unique
  ON seller_ledger(seller_id, order_id, type, reason);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_unsettled
  ON seller_ledger(seller_id, settled_at)
  WHERE settled_at IS NULL;

ALTER TABLE seller_payouts
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE seller_payouts
SET total_amount = COALESCE(total_amount, amount);

ALTER TABLE seller_payouts
  ALTER COLUMN total_amount SET NOT NULL;

ALTER TABLE seller_payouts
  ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE seller_payouts
  DROP CONSTRAINT IF EXISTS seller_payouts_status_check;

ALTER TABLE seller_payouts
  ADD CONSTRAINT seller_payouts_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'INITIATED', 'COMPLETED', 'FAILED'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS settlement_eligible_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_settlement_pending
  ON orders(settlement_status, settlement_eligible_at)
  WHERE settlement_status = 'PENDING';


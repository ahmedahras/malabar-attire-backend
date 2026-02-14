CREATE TABLE IF NOT EXISTS order_financials (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  order_total NUMERIC(12, 2) NOT NULL,
  platform_commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  platform_commission_amount NUMERIC(12, 2) NOT NULL,
  seller_payout_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  refunded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS seller_balance (
  seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pending_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_out_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE seller_balance
  ADD COLUMN IF NOT EXISTS seller_financial_mode TEXT NOT NULL DEFAULT 'NORMAL'
  CHECK (seller_financial_mode IN ('NORMAL', 'WATCH', 'ISOLATED')),
  ADD COLUMN IF NOT EXISTS risk_below_threshold_since TIMESTAMPTZ;

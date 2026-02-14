CREATE TABLE IF NOT EXISTS seller_risk_metrics (
  seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refund_rate_last_7_days NUMERIC(6, 4) NOT NULL DEFAULT 0,
  order_cancellation_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  failed_payment_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  negative_balance_frequency INTEGER NOT NULL DEFAULT 0,
  payout_hold_count INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal', 'watch', 'critical')),
  last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE seller_balance
  ADD COLUMN IF NOT EXISTS risk_watch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_score_at TIMESTAMPTZ;

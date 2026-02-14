CREATE TABLE IF NOT EXISTS finance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (
    type IN ('mismatch', 'ledger_inconsistency', 'high_refunds', 'seller_negative_spike', 'payout_failure')
  ),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_alerts_type ON finance_alerts(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_alerts_resolved ON finance_alerts(resolved, created_at DESC);

CREATE TABLE IF NOT EXISTS payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES seller_payouts(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_events_payout
  ON payout_events(payout_id, changed_at DESC);


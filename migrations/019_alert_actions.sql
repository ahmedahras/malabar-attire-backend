CREATE TABLE IF NOT EXISTS alert_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES finance_alerts(id) ON DELETE CASCADE,
  action_taken TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_actions_alert
  ON alert_actions(alert_id, executed_at DESC);

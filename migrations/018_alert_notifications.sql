CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES finance_alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'webhook')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert
  ON alert_notifications(alert_id, sent_at DESC);

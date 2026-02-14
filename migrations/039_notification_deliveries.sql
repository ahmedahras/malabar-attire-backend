CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON notification_deliveries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON notification_deliveries(status, created_at DESC);

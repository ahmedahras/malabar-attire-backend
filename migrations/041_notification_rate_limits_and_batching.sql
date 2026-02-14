ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS batch_key TEXT,
  ADD COLUMN IF NOT EXISTS batched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batched_notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_batch
  ON notifications(batch_key, created_at DESC)
  WHERE batch_key IS NOT NULL AND batched_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_rate_limits (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notification_rate_limits_window
  ON notification_rate_limits(window_start DESC);

-- System state for operational switches
CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  payouts_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  freeze_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_state (id, payouts_frozen)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Align alert_actions schema with action_type
ALTER TABLE alert_actions
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS result TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'alert_actions'
      AND column_name = 'action_taken'
  ) THEN
    UPDATE alert_actions
    SET action_type = COALESCE(action_type, action_taken),
        result = COALESCE(result, 'unknown')
    WHERE action_type IS NULL OR result IS NULL;
  ELSE
    UPDATE alert_actions
    SET result = COALESCE(result, 'unknown')
    WHERE result IS NULL;
  END IF;
END$$;

ALTER TABLE alert_actions
  DROP COLUMN IF EXISTS action_taken;

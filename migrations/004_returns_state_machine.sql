-- Extend return_status enum with required states
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'RETURN_IN_TRANSIT'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'RETURN_IN_TRANSIT';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'RECEIVED_BY_SELLER'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'RECEIVED_BY_SELLER';
    END IF;
  END IF;
END$$;

-- Return status history log
CREATE TABLE IF NOT EXISTS return_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  from_status return_status NOT NULL,
  to_status return_status NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_status_history_request
  ON return_status_history(return_request_id, created_at DESC);

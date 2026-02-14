-- Extend return_status enum with admin dispute states
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'DISPUTED'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'DISPUTED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'ADMIN_REVIEW'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'ADMIN_REVIEW';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'ADMIN_APPROVED'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'ADMIN_APPROVED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'ADMIN_REJECTED'
        AND enumtypid = 'return_status'::regtype
    ) THEN
      ALTER TYPE return_status ADD VALUE 'ADMIN_REJECTED';
    END IF;
  END IF;
END$$;

COMMIT;

BEGIN;

-- Decision source enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_source') THEN
    CREATE TYPE decision_source AS ENUM ('SELLER', 'ADMIN');
  END IF;
END$$;

-- Extend return_requests for admin override
ALTER TABLE return_requests
  ADD COLUMN IF NOT EXISTS decision_source decision_source,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Index for admin queue
CREATE INDEX IF NOT EXISTS idx_return_requests_disputed
  ON return_requests(status)
  WHERE status IN ('DISPUTED', 'ADMIN_REVIEW');

COMMIT;

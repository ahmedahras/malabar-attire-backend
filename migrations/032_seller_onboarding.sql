-- Ensure shops table supports seller onboarding requirements
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_owner_user_id_key'
  ) THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_owner_user_id_key UNIQUE (owner_user_id);
  END IF;
END$$;

-- Seller application system + user roles array.
-- Safe to run multiple times.

-- Users.roles as TEXT[] for multi-role support
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roles TEXT[];

UPDATE users
SET roles = ARRAY[role::text]
WHERE roles IS NULL;

ALTER TABLE users
  ALTER COLUMN roles SET DEFAULT ARRAY['customer']::text[];

ALTER TABLE users
  ALTER COLUMN roles SET NOT NULL;

-- Seller applications
CREATE TABLE IF NOT EXISTS seller_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  id_proof_url TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  ifsc_code TEXT,
  category_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE seller_applications
  DROP CONSTRAINT IF EXISTS seller_applications_status_check;

ALTER TABLE seller_applications
  ADD CONSTRAINT seller_applications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_seller_applications_status_created
  ON seller_applications(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_applications_user_pending
  ON seller_applications(user_id)
  WHERE status = 'pending';


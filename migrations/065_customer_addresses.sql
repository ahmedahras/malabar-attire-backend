-- Migration 065: Customer address book
-- Allows customers to save and reuse delivery addresses.

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'India',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);

-- Only one default per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_default
  ON customer_addresses(user_id)
  WHERE is_default = TRUE;

COMMENT ON TABLE customer_addresses IS
  'Saved delivery addresses for customers. One may be marked as default.';

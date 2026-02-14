-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_status') THEN
    CREATE TYPE return_status AS ENUM (
      'REQUESTED',
      'SELLER_REVIEW',
      'APPROVED',
      'REJECTED',
      'RETURNED',
      'INSPECTION',
      'REFUNDED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_reason') THEN
    CREATE TYPE return_reason AS ENUM ('DAMAGED', 'WRONG_ITEM');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seller_decision') THEN
    CREATE TYPE seller_decision AS ENUM ('APPROVED', 'REJECTED');
  END IF;
END$$;

-- Return requests
CREATE TABLE IF NOT EXISTS return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason return_reason NOT NULL,
  status return_status NOT NULL DEFAULT 'REQUESTED',
  video_proof_url TEXT NOT NULL,
  seller_decision seller_decision,
  seller_notes TEXT,
  seller_reviewed_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    status <> 'REFUNDED' OR seller_decision = 'APPROVED'
  ),
  CHECK (
    seller_decision IS NULL OR status IN ('APPROVED', 'REJECTED', 'REFUNDED')
  )
);

-- Return evidence (multiple media proofs)
CREATE TABLE IF NOT EXISTS return_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'image')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_seller ON return_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_evidence_request ON return_evidence(return_request_id);

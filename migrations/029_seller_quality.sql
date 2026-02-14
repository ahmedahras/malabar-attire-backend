CREATE TABLE IF NOT EXISTS seller_quality_metrics (
  seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  delivery_success_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  return_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  video_verified_return_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  customer_repeat_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  rating_stability NUMERIC(6, 4) NOT NULL DEFAULT 0,
  order_volume_consistency NUMERIC(6, 4) NOT NULL DEFAULT 0,
  seller_quality_score INTEGER NOT NULL DEFAULT 0,
  seller_tier TEXT NOT NULL DEFAULT 'BRONZE'
    CHECK (seller_tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  ranking_boost_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  payout_speed_days INTEGER NOT NULL DEFAULT 7,
  reserve_percent NUMERIC(4, 2) NOT NULL DEFAULT 12.00,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seller_quality_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_quality_score INTEGER NOT NULL,
  seller_tier TEXT NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS seller_quality_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_tier TEXT NOT NULL DEFAULT 'BRONZE'
    CHECK (seller_tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  ADD COLUMN IF NOT EXISTS trust_badge BOOLEAN NOT NULL DEFAULT FALSE;

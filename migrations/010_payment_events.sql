-- Payment intents
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_payment_id TEXT,
  provider_order_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('created', 'authorized', 'captured', 'failed', 'cancelled', 'refunded')
  ),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  attempt INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON payment_intents(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_order ON payment_intents(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_payment ON payment_intents(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status, updated_at DESC);

-- Webhook event dedupe
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

-- Domain events
CREATE TABLE IF NOT EXISTS domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domain_events_status ON domain_events(status, created_at DESC);

-- Extend order_status enum to support new lifecycle
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'CREATED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'CREATED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'PAID'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'PAID';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'PROCESSING'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'PROCESSING';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'SHIPPED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'SHIPPED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'DELIVERED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'DELIVERED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'COMPLETED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'COMPLETED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'CANCELLED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'CANCELLED';
    END IF;
  END IF;
END$$;

-- Order status history
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status NOT NULL,
  to_status order_status NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON order_status_history(order_id, created_at DESC);

-- Link payment intent if used
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

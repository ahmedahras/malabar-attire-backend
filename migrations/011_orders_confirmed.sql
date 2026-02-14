-- Extend order_status enum with CONFIRMED
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'CONFIRMED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'CONFIRMED';
    END IF;
  END IF;
END$$;

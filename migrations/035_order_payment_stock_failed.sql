DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'PAYMENT_STOCK_FAILED'
        AND enumtypid = 'order_status'::regtype
    ) THEN
      ALTER TYPE order_status ADD VALUE 'PAYMENT_STOCK_FAILED';
    END IF;
  END IF;
END$$;

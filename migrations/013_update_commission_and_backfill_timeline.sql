-- Update existing commission rates to 12%
UPDATE shops
SET commission_rate = 12.00
WHERE commission_rate <> 12.00;

-- Backfill CREATED timeline entries for existing orders (optional)
INSERT INTO order_timeline (order_id, event_type, source, metadata)
SELECT o.id, 'CREATED', 'system', '{"source":"backfill"}'::jsonb
FROM orders o
LEFT JOIN order_timeline t
  ON t.order_id = o.id AND t.event_type = 'CREATED'
WHERE t.id IS NULL;

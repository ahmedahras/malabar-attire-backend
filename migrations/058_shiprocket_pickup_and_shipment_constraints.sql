ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_name TEXT,
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_address JSONB,
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_configured_at TIMESTAMPTZ;

DELETE FROM order_shipments a
USING order_shipments b
WHERE a.ctid < b.ctid
  AND a.order_id = b.order_id
  AND a.seller_id = b.seller_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_order_seller_unique
  ON order_shipments(order_id, seller_id);

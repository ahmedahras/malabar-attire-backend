ALTER TABLE IF EXISTS order_shipments
  ADD COLUMN IF NOT EXISTS shiprocket_order_id TEXT,
  ADD COLUMN IF NOT EXISTS awb_code TEXT,
  ADD COLUMN IF NOT EXISTS courier_name TEXT,
  ADD COLUMN IF NOT EXISTS shipment_status TEXT,
  ADD COLUMN IF NOT EXISTS pickup_scheduled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES order_shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  location TEXT,
  event_time TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_shipment
  ON shipment_tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_time
  ON shipment_tracking_events(event_time DESC);

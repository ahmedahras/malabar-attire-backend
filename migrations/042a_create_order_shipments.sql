CREATE TABLE IF NOT EXISTS order_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    seller_id UUID NOT NULL,
    courier_name TEXT,
    tracking_id TEXT,
    tracking_url TEXT,
    awb_code TEXT,
    shiprocket_shipment_id TEXT,
    shiprocket_order_id TEXT,
    status TEXT DEFAULT 'CREATED',
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

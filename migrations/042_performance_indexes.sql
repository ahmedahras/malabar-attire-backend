CREATE INDEX IF NOT EXISTS idx_products_shop_status
  ON products(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_financials_order
  ON order_financials(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_date
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_product_active
  ON product_reservations(product_id)
  WHERE status = 'ACTIVE';

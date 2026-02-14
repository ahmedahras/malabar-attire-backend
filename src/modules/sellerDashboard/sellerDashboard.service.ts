import { db } from "../../db/pool";

export const getDashboardSummary = async (shopId: string, sellerId: string) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const [salesResult, ordersResult, refundsResult, pendingResult] = await Promise.all([
      client.query(
        `SELECT COALESCE(SUM(of.order_total), 0)::numeric AS total_sales
         FROM order_financials of
         INNER JOIN orders o ON o.id = of.order_id
         WHERE o.shop_id = $1
           AND o.payment_status = 'paid'`,
        [shopId]
      ),
      client.query(
        `SELECT COUNT(*)::int AS total_orders
         FROM orders o
         WHERE o.shop_id = $1
           AND o.payment_status = 'paid'`,
        [shopId]
      ),
      client.query(
        `SELECT COUNT(*)::int AS refund_count,
                COALESCE(SUM(r.amount), 0)::numeric AS refund_amount
         FROM order_refunds r
         INNER JOIN orders o ON o.id = r.order_id
         WHERE o.shop_id = $1
           AND r.status = 'COMPLETED'`,
        [shopId]
      ),
      client.query(
        `SELECT pending_amount
         FROM seller_balance
         WHERE seller_id = $1`,
        [sellerId]
      )
    ]);

    const totalSales = Number(salesResult.rows[0]?.total_sales ?? 0);
    const totalOrders = Number(ordersResult.rows[0]?.total_orders ?? 0);
    const totalRefunds = Number(refundsResult.rows[0]?.refund_count ?? 0);
    const refundAmount = Number(refundsResult.rows[0]?.refund_amount ?? 0);
    const netRevenue = totalSales - refundAmount;
    const pendingPayout = Number(pendingResult.rows[0]?.pending_amount ?? 0);

    await client.query("COMMIT");
    return { totalSales, totalOrders, totalRefunds, netRevenue, pendingPayout };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getSalesTrend = async (
  shopId: string,
  status: "PAID" | "DELIVERED" | "ALL"
) => {
  const statusClause =
    status === "ALL"
      ? "TRUE"
      : status === "DELIVERED"
        ? "o.status = 'DELIVERED'"
        : "o.payment_status = 'paid'";

  const { rows } = await db.query(
    `WITH days AS (
       SELECT generate_series(
         DATE_TRUNC('day', NOW()) - INTERVAL '29 days',
         DATE_TRUNC('day', NOW()),
         INTERVAL '1 day'
       ) AS day
     ),
     sales AS (
       SELECT DATE_TRUNC('day', o.placed_at) AS day,
              COALESCE(SUM(of.order_total), 0)::numeric AS revenue
       FROM orders o
       INNER JOIN order_financials of ON of.order_id = o.id
       WHERE o.shop_id = $1
         AND ${statusClause}
         AND o.placed_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1
     )
     SELECT d.day,
            COALESCE(s.revenue, 0)::numeric AS revenue
     FROM days d
     LEFT JOIN sales s ON s.day = d.day
     ORDER BY d.day`,
    [shopId]
  );
  return rows.map((row) => ({
    day: row.day,
    revenue: Number(row.revenue)
  }));
};

export const getTopProducts = async (
  shopId: string,
  status: "PAID" | "DELIVERED" | "ALL",
  limit: number,
  offset: number
) => {
  const statusClause =
    status === "ALL"
      ? "TRUE"
      : status === "DELIVERED"
        ? "o.status = 'DELIVERED'"
        : "o.payment_status = 'paid'";
  const { rows } = await db.query(
    `SELECT p.id AS product_id,
            p.name,
            COALESCE(SUM(oi.quantity), 0)::int AS units_sold
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN product_variant_colors vc ON vc.id = oi.variant_color_id
     INNER JOIN products p ON p.id = vc.product_id
     WHERE o.shop_id = $1
       AND ${statusClause}
     GROUP BY p.id, p.name
     ORDER BY units_sold DESC
     LIMIT $2 OFFSET $3`,
    [shopId, limit, offset]
  );
  return rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    unitsSold: Number(row.units_sold)
  }));
};

export const getLowStockProducts = async (shopId: string) => {
  const { rows } = await db.query(
    `SELECT id, name, quantity
     FROM products
     WHERE shop_id = $1
       AND quantity <= 3
     ORDER BY quantity ASC, updated_at DESC`,
    [shopId]
  );
  return rows.map((row) => ({
    productId: row.id,
    name: row.name,
    quantity: Number(row.quantity)
  }));
};

export const getRefundsSummary = async (shopId: string) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS refund_count,
            COALESCE(SUM(r.amount), 0)::numeric AS refund_amount
     FROM order_refunds r
     INNER JOIN orders o ON o.id = r.order_id
     WHERE o.shop_id = $1
       AND r.status = 'COMPLETED'`,
    [shopId]
  );
  return {
    refundCount: Number(rows[0]?.refund_count ?? 0),
    refundAmount: Number(rows[0]?.refund_amount ?? 0)
  };
};

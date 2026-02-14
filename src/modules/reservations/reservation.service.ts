import { db } from "../../db/pool";
import { createNotification } from "../notifications/notification.service";
import { invalidatePattern } from "../../utils/cache";

export const getAvailableStock = async (productId: string) => {
  const { rows } = await db.query(
    `SELECT p.quantity,
            COALESCE(r.reserved, 0) AS reserved
     FROM products p
     LEFT JOIN (
       SELECT product_id, SUM(quantity)::int AS reserved
       FROM product_reservations
       WHERE status = 'ACTIVE' AND expires_at > NOW()
       GROUP BY product_id
     ) r ON r.product_id = p.id
     WHERE p.id = $1`,
    [productId]
  );
  if (!rows[0]) {
    return null;
  }
  const available = Number(rows[0].quantity) - Number(rows[0].reserved);
  return Math.max(0, available);
};

export const reserveProduct = async (productId: string, userId: string, quantity: number) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: productRows } = await client.query(
      `SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [productId]
    );
    const product = productRows[0];
    if (!product) {
      await client.query("ROLLBACK");
      throw new Error("Product not found");
    }

    const { rows: reservedRows } = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
       FROM product_reservations
       WHERE product_id = $1
         AND status = 'ACTIVE'
         AND expires_at > NOW()`,
      [productId]
    );
    const reserved = Number(reservedRows[0]?.reserved ?? 0);
    const available = Number(product.quantity) - reserved;

    if (available < quantity) {
      await client.query("ROLLBACK");
      throw new Error("Out of stock");
    }

    const { rows } = await client.query(
      `INSERT INTO product_reservations
       (product_id, user_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW() + INTERVAL '5 minutes')
       RETURNING id, product_id, user_id, quantity, status, expires_at`,
      [productId, userId, quantity]
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const convertReservation = async (reservationId: string, userId: string, isAdmin = false) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: resRows } = await client.query(
      `SELECT id, product_id, user_id, quantity, status, expires_at
       FROM product_reservations
       WHERE id = $1
       FOR UPDATE`,
      [reservationId]
    );
    const reservation = resRows[0];
    if (!reservation) {
      await client.query("ROLLBACK");
      throw new Error("Reservation not found");
    }
    if (!isAdmin && reservation.user_id !== userId) {
      await client.query("ROLLBACK");
      throw new Error("Forbidden");
    }
    if (reservation.status !== "ACTIVE" || new Date(reservation.expires_at).getTime() < Date.now()) {
      await client.query("ROLLBACK");
      throw new Error("Reservation expired");
    }

    const { rows: productRows } = await client.query(
      `SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [reservation.product_id]
    );
    const product = productRows[0];
    if (!product) {
      await client.query("ROLLBACK");
      throw new Error("Product not found");
    }
    if (Number(product.quantity) < Number(reservation.quantity)) {
      await client.query("ROLLBACK");
      throw new Error("Out of stock");
    }

    await client.query(
      `UPDATE product_reservations
       SET status = 'CONVERTED'
       WHERE id = $1`,
      [reservationId]
    );

    const updateResult = await client.query(
      `UPDATE products
       SET quantity = quantity - $2,
           status = CASE WHEN quantity - $2 <= 0 THEN 'OUT_OF_STOCK' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING quantity, shop_id`,
      [reservation.product_id, reservation.quantity]
    );

    const updated = updateResult.rows[0];
    if (updated && Number(updated.quantity) <= 3) {
      const { rows: sellerRows } = await client.query(
        `SELECT owner_user_id FROM shops WHERE id = $1`,
        [updated.shop_id]
      );
      const sellerId = sellerRows[0]?.owner_user_id as string | undefined;
      if (sellerId) {
        await createNotification({
          userId: sellerId,
          type: "low_stock",
          title: "Low stock alert",
          message: `Product ${reservation.product_id} is low on stock.`,
          metadata: { productId: reservation.product_id, quantity: updated.quantity },
          client
        });
      }
    }

    await invalidatePattern("cache:products:*");

    await client.query("COMMIT");
    return reservation;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const convertReservationsForOrder = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  orderId: string,
  userId: string
) => {
  const { rows: items } = await client.query(
    `SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );

  if (items.length === 0) {
    return { converted: 0 };
  }

  const neededByProduct = new Map<string, number>();
  for (const item of items) {
    const current = neededByProduct.get(item.product_id) ?? 0;
    neededByProduct.set(item.product_id, current + Number(item.quantity));
  }

  for (const [productId, needed] of neededByProduct.entries()) {
    const { rows: productRows } = await client.query(
      `SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [productId]
    );
    const product = productRows[0];
    if (!product) {
      throw new Error("Product not found");
    }
    if (Number(product.quantity) < needed) {
      throw new Error("Out of stock");
    }

    const { rows: reservations } = await client.query(
      `SELECT id, quantity, expires_at
       FROM product_reservations
       WHERE product_id = $1
         AND user_id = $2
         AND status = 'ACTIVE'
         AND expires_at > NOW()
       ORDER BY created_at ASC
       FOR UPDATE`,
      [productId, userId]
    );

    let remaining = needed;
    for (const reservation of reservations) {
      if (remaining <= 0) {
        break;
      }
      const qty = Number(reservation.quantity);
      if (qty > remaining) {
        throw new Error("Reservation mismatch");
      }
      await client.query(
        `UPDATE product_reservations
         SET status = 'CONVERTED'
         WHERE id = $1`,
        [reservation.id]
      );
      remaining -= qty;
    }

    if (remaining > 0) {
      throw new Error("Reservation expired");
    }

    const updateResult = await client.query(
      `UPDATE products
       SET quantity = quantity - $2,
           status = CASE WHEN quantity - $2 <= 0 THEN 'OUT_OF_STOCK' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING quantity, shop_id`,
      [productId, needed]
    );

    const updated = updateResult.rows[0];
    if (updated && Number(updated.quantity) <= 3) {
      const { rows: sellerRows } = await client.query(
        `SELECT owner_user_id FROM shops WHERE id = $1`,
        [updated.shop_id]
      );
      const sellerId = sellerRows[0]?.owner_user_id as string | undefined;
      if (sellerId) {
        await createNotification({
          userId: sellerId,
          type: "low_stock",
          title: "Low stock alert",
          message: `Product ${productId} is low on stock.`,
          metadata: { productId, quantity: updated.quantity },
          client
        });
      }
    }
  }

  await invalidatePattern("cache:products:*");
  return { converted: neededByProduct.size };
};

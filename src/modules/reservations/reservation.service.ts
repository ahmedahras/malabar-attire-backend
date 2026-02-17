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
  _userId: string
) => {
  const { rows: items } = await client.query(
    `SELECT pvc.product_id, oi.variant_color_id, oi.size, oi.quantity
     FROM order_items oi
     INNER JOIN product_variant_colors pvc ON pvc.id = oi.variant_color_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  if (items.length === 0) {
    return { converted: 0 };
  }

  const neededByVariant = new Map<
    string,
    { variantColorId: string; size: string; needed: number; productId: string }
  >();
  for (const item of items) {
    const variantColorId = String(item.variant_color_id);
    const size = String(item.size);
    const key = `${variantColorId}:${size}`;
    const current = neededByVariant.get(key);
    if (current) {
      current.needed += Number(item.quantity);
    } else {
      neededByVariant.set(key, {
        variantColorId,
        size,
        needed: Number(item.quantity),
        productId: String(item.product_id)
      });
    }
  }

  const touchedProducts = new Set<string>();

  for (const { variantColorId, size, needed, productId } of neededByVariant.values()) {
    const { rows: stockRows } = await client.query(
      `SELECT stock
       FROM product_variant_sizes
       WHERE variant_color_id = $1
         AND size = $2
       FOR UPDATE`,
      [variantColorId, size]
    );

    const currentStock = Number(stockRows[0]?.stock ?? 0);
    if (currentStock < needed) {
      throw new Error("Out of stock");
    }

    await client.query(
      `UPDATE product_variant_sizes
       SET stock = stock - $3
       WHERE variant_color_id = $1
         AND size = $2`,
      [variantColorId, size, needed]
    );

    touchedProducts.add(productId);
    const remainingStock = currentStock - needed;
    if (remainingStock <= 3) {
      const { rows: sellerRows } = await client.query(
        `SELECT s.owner_user_id
         FROM product_variant_colors pvc
         INNER JOIN products p ON p.id = pvc.product_id
         INNER JOIN shops s ON s.id = p.shop_id
         WHERE pvc.id = $1`,
        [variantColorId]
      );
      const sellerId = sellerRows[0]?.owner_user_id as string | undefined;
      if (sellerId) {
        await createNotification({
          userId: sellerId,
          type: "low_stock",
          title: "Low stock alert",
          message: `Product ${productId} is low on stock.`,
          metadata: { productId, quantity: remainingStock, size, variantColorId },
          client
        });
      }
    }
  }

  await invalidatePattern("cache:products:*");
  return { converted: touchedProducts.size };
};

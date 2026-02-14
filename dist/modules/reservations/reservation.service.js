"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertReservationsForOrder = exports.convertReservation = exports.reserveProduct = exports.getAvailableStock = void 0;
const pool_1 = require("../../db/pool");
const notification_service_1 = require("../notifications/notification.service");
const cache_1 = require("../../utils/cache");
const getAvailableStock = async (productId) => {
    const { rows } = await pool_1.db.query(`SELECT p.quantity,
            COALESCE(r.reserved, 0) AS reserved
     FROM products p
     LEFT JOIN (
       SELECT product_id, SUM(quantity)::int AS reserved
       FROM product_reservations
       WHERE status = 'ACTIVE' AND expires_at > NOW()
       GROUP BY product_id
     ) r ON r.product_id = p.id
     WHERE p.id = $1`, [productId]);
    if (!rows[0]) {
        return null;
    }
    const available = Number(rows[0].quantity) - Number(rows[0].reserved);
    return Math.max(0, available);
};
exports.getAvailableStock = getAvailableStock;
const reserveProduct = async (productId, userId, quantity) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows: productRows } = await client.query(`SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`, [productId]);
        const product = productRows[0];
        if (!product) {
            await client.query("ROLLBACK");
            throw new Error("Product not found");
        }
        const { rows: reservedRows } = await client.query(`SELECT COALESCE(SUM(quantity), 0)::int AS reserved
       FROM product_reservations
       WHERE product_id = $1
         AND status = 'ACTIVE'
         AND expires_at > NOW()`, [productId]);
        const reserved = Number(reservedRows[0]?.reserved ?? 0);
        const available = Number(product.quantity) - reserved;
        if (available < quantity) {
            await client.query("ROLLBACK");
            throw new Error("Out of stock");
        }
        const { rows } = await client.query(`INSERT INTO product_reservations
       (product_id, user_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW() + INTERVAL '5 minutes')
       RETURNING id, product_id, user_id, quantity, status, expires_at`, [productId, userId, quantity]);
        await client.query("COMMIT");
        return rows[0];
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.reserveProduct = reserveProduct;
const convertReservation = async (reservationId, userId, isAdmin = false) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows: resRows } = await client.query(`SELECT id, product_id, user_id, quantity, status, expires_at
       FROM product_reservations
       WHERE id = $1
       FOR UPDATE`, [reservationId]);
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
        const { rows: productRows } = await client.query(`SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`, [reservation.product_id]);
        const product = productRows[0];
        if (!product) {
            await client.query("ROLLBACK");
            throw new Error("Product not found");
        }
        if (Number(product.quantity) < Number(reservation.quantity)) {
            await client.query("ROLLBACK");
            throw new Error("Out of stock");
        }
        await client.query(`UPDATE product_reservations
       SET status = 'CONVERTED'
       WHERE id = $1`, [reservationId]);
        const updateResult = await client.query(`UPDATE products
       SET quantity = quantity - $2,
           status = CASE WHEN quantity - $2 <= 0 THEN 'OUT_OF_STOCK' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING quantity, shop_id`, [reservation.product_id, reservation.quantity]);
        const updated = updateResult.rows[0];
        if (updated && Number(updated.quantity) <= 3) {
            const { rows: sellerRows } = await client.query(`SELECT owner_user_id FROM shops WHERE id = $1`, [updated.shop_id]);
            const sellerId = sellerRows[0]?.owner_user_id;
            if (sellerId) {
                await (0, notification_service_1.createNotification)({
                    userId: sellerId,
                    type: "low_stock",
                    title: "Low stock alert",
                    message: `Product ${reservation.product_id} is low on stock.`,
                    metadata: { productId: reservation.product_id, quantity: updated.quantity },
                    client
                });
            }
        }
        await (0, cache_1.invalidatePattern)("cache:products:*");
        await client.query("COMMIT");
        return reservation;
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.convertReservation = convertReservation;
const convertReservationsForOrder = async (client, orderId, userId) => {
    const { rows: items } = await client.query(`SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1`, [orderId]);
    if (items.length === 0) {
        return { converted: 0 };
    }
    const neededByProduct = new Map();
    for (const item of items) {
        const current = neededByProduct.get(item.product_id) ?? 0;
        neededByProduct.set(item.product_id, current + Number(item.quantity));
    }
    for (const [productId, needed] of neededByProduct.entries()) {
        const { rows: productRows } = await client.query(`SELECT quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`, [productId]);
        const product = productRows[0];
        if (!product) {
            throw new Error("Product not found");
        }
        if (Number(product.quantity) < needed) {
            throw new Error("Out of stock");
        }
        const { rows: reservations } = await client.query(`SELECT id, quantity, expires_at
       FROM product_reservations
       WHERE product_id = $1
         AND user_id = $2
         AND status = 'ACTIVE'
         AND expires_at > NOW()
       ORDER BY created_at ASC
       FOR UPDATE`, [productId, userId]);
        let remaining = needed;
        for (const reservation of reservations) {
            if (remaining <= 0) {
                break;
            }
            const qty = Number(reservation.quantity);
            if (qty > remaining) {
                throw new Error("Reservation mismatch");
            }
            await client.query(`UPDATE product_reservations
         SET status = 'CONVERTED'
         WHERE id = $1`, [reservation.id]);
            remaining -= qty;
        }
        if (remaining > 0) {
            throw new Error("Reservation expired");
        }
        const updateResult = await client.query(`UPDATE products
       SET quantity = quantity - $2,
           status = CASE WHEN quantity - $2 <= 0 THEN 'OUT_OF_STOCK' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING quantity, shop_id`, [productId, needed]);
        const updated = updateResult.rows[0];
        if (updated && Number(updated.quantity) <= 3) {
            const { rows: sellerRows } = await client.query(`SELECT owner_user_id FROM shops WHERE id = $1`, [updated.shop_id]);
            const sellerId = sellerRows[0]?.owner_user_id;
            if (sellerId) {
                await (0, notification_service_1.createNotification)({
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
    await (0, cache_1.invalidatePattern)("cache:products:*");
    return { converted: neededByProduct.size };
};
exports.convertReservationsForOrder = convertReservationsForOrder;
//# sourceMappingURL=reservation.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertReservationHandler = exports.reserveCartItem = void 0;
const zod_1 = require("zod");
const pool_1 = require("../../db/pool");
const reservation_service_1 = require("./reservation.service");
const reserveSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    variantColorId: zod_1.z.string().uuid(),
    size: zod_1.z.string().min(1),
    quantity: zod_1.z.number().int().positive()
});
const convertSchema = zod_1.z.object({
    reservationId: zod_1.z.string().uuid()
});
const reserveCartItem = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = reserveSchema.parse(req.body);
    const productResult = await pool_1.db.query(`SELECT p.id,
            p.name,
            p.price,
            p.district,
            p.images,
            p.status,
            p.is_approved,
            vc.id AS variant_color_id,
            vc.color_name,
            vc.color_image_url,
            vs.size,
            vs.stock
     FROM products p
     INNER JOIN product_variant_colors vc ON vc.id = $2 AND vc.product_id = p.id
     INNER JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id AND vs.size = $3
     WHERE p.id = $1`, [body.productId, body.variantColorId, body.size]);
    const product = productResult.rows[0];
    if (!product) {
        return res.status(404).json({ error: "Product not found" });
    }
    if (product.status !== "LIVE" || !product.is_approved) {
        return res.status(409).json({ error: "Product unavailable" });
    }
    let reservation;
    try {
        reservation = await (0, reservation_service_1.reserveProduct)(body.productId, req.user.sub, body.quantity);
    }
    catch (error) {
        if (error instanceof Error && error.message === "Out of stock") {
            return res.status(409).json({ error: "Out of stock" });
        }
        if (error instanceof Error && error.message === "Product not found") {
            return res.status(404).json({ error: "Product not found" });
        }
        throw error;
    }
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows: cartRows } = await client.query(`SELECT id FROM carts WHERE user_id = $1 AND status = 'active'`, [req.user.sub]);
        let cartId = cartRows[0]?.id;
        if (!cartId) {
            const { rows } = await client.query(`INSERT INTO carts (user_id, status)
         VALUES ($1, 'active')
         RETURNING id`, [req.user.sub]);
            cartId = rows[0].id;
        }
        const unitPrice = Number(product.price);
        const productSnapshot = {
            id: product.id,
            name: product.name,
            district: product.district,
            price: unitPrice,
            images: product.images ?? []
        };
        const variantSnapshot = {
            variantColorId: product.variant_color_id,
            colorName: product.color_name,
            colorImageUrl: product.color_image_url ?? null,
            size: product.size,
            stock: product.stock
        };
        const { rows: existing } = await client.query(`SELECT id, quantity
       FROM cart_items
       WHERE cart_id = $1 AND variant_color_id = $2 AND size = $3
       FOR UPDATE`, [cartId, body.variantColorId, body.size]);
        let cartItemId;
        if (existing[0]) {
            const nextQty = Number(existing[0].quantity) + body.quantity;
            const totalPrice = unitPrice * nextQty;
            await client.query(`UPDATE cart_items
         SET quantity = $3,
             unit_price_snapshot = $4,
             total_price_snapshot = $5,
             product_snapshot = $6,
             variant_snapshot = $7,
             updated_at = NOW()
         WHERE id = $1`, [
                existing[0].id,
                cartId,
                nextQty,
                unitPrice,
                totalPrice,
                JSON.stringify(productSnapshot),
                JSON.stringify(variantSnapshot)
            ]);
            cartItemId = existing[0].id;
        }
        else {
            const totalPrice = unitPrice * body.quantity;
            const { rows: inserted } = await client.query(`INSERT INTO cart_items
         (cart_id, product_id, variant_color_id, size, quantity,
          unit_price_snapshot, total_price_snapshot, product_snapshot, variant_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`, [
                cartId,
                body.productId,
                body.variantColorId,
                body.size,
                body.quantity,
                unitPrice,
                totalPrice,
                JSON.stringify(productSnapshot),
                JSON.stringify(variantSnapshot)
            ]);
            cartItemId = inserted[0].id;
        }
        await client.query("COMMIT");
        return res.status(201).json({
            reservationId: reservation.id,
            cartId,
            cartItemId,
            expiresAt: reservation.expires_at
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.reserveCartItem = reserveCartItem;
const convertReservationHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = convertSchema.parse(req.body);
    try {
        await (0, reservation_service_1.convertReservation)(body.reservationId, req.user.sub, req.user.role === "admin");
        return res.json({ success: true, reservationId: body.reservationId });
    }
    catch (error) {
        if (error instanceof Error && error.message === "Reservation not found") {
            return res.status(404).json({ error: "Reservation not found" });
        }
        if (error instanceof Error && error.message === "Reservation expired") {
            return res.status(409).json({ error: "Reservation expired" });
        }
        if (error instanceof Error && error.message === "Out of stock") {
            return res.status(409).json({ error: "Out of stock" });
        }
        if (error instanceof Error && error.message === "Forbidden") {
            return res.status(403).json({ error: "Forbidden" });
        }
        throw error;
    }
};
exports.convertReservationHandler = convertReservationHandler;
//# sourceMappingURL=reservation.controller.js.map
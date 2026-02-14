"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveCartForUser = void 0;
const pool_1 = require("../db/pool");
const getActiveCartForUser = async (userId) => {
    const cartResult = await pool_1.db.query(`SELECT c.id
     FROM carts c
     WHERE c.user_id = $1
       AND c.status = 'active'
     ORDER BY c.created_at DESC
     LIMIT 1`, [userId]);
    const cartId = cartResult.rows[0]?.id ?? null;
    if (!cartId) {
        return {
            cartId: null,
            items: [],
            totalAmount: 0
        };
    }
    const itemResult = await pool_1.db.query(`SELECT ci.product_id,
            ci.variant_color_id,
            ci.quantity,
            ci.unit_price_snapshot,
            ci.total_price_snapshot
     FROM cart_items ci
     WHERE ci.cart_id = $1`, [cartId]);
    const items = itemResult.rows.map((row) => ({
        productId: row.product_id,
        variantId: row.variant_color_id,
        quantity: Number(row.quantity ?? 0),
        price: Number(row.unit_price_snapshot ?? 0)
    }));
    const totalAmount = itemResult.rows.reduce((sum, row) => sum + Number(row.total_price_snapshot ?? 0), 0);
    return {
        cartId,
        items,
        totalAmount: Number(totalAmount.toFixed(2))
    };
};
exports.getActiveCartForUser = getActiveCartForUser;
//# sourceMappingURL=cart.service.js.map
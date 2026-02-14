"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reserveStock = void 0;
const pool_1 = require("../db/pool");
const productLifecycleService_1 = require("./productLifecycleService");
const reserveStock = async (variantColorId, size, quantity) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT vs.stock, vc.product_id
       FROM product_variant_sizes vs
       INNER JOIN product_variant_colors vc ON vc.id = vs.variant_color_id
       WHERE vs.variant_color_id = $1 AND vs.size = $2
       FOR UPDATE`, [variantColorId, size]);
        if (!rows[0] || rows[0].stock < quantity) {
            throw new Error("Insufficient stock");
        }
        await client.query(`UPDATE product_variant_sizes
       SET stock = stock - $3
       WHERE variant_color_id = $1 AND size = $2`, [variantColorId, size, quantity]);
        const productId = rows[0]?.product_id;
        if (productId) {
            await (0, productLifecycleService_1.markProductsOutOfStockIfNeeded)(client, [productId]);
        }
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.reserveStock = reserveStock;
//# sourceMappingURL=stockService.js.map
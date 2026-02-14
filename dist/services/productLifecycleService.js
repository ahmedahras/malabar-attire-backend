"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markProductsOutOfStockIfNeeded = exports.blockProductsForSeller = void 0;
const pool_1 = require("../db/pool");
const blockProductsForSeller = async (sellerId, _reason) => {
    await pool_1.db.query(`UPDATE products p
     SET is_active = FALSE, updated_at = NOW()
     FROM shops s
     WHERE s.id = p.shop_id
       AND s.owner_user_id = $1`, [sellerId]);
};
exports.blockProductsForSeller = blockProductsForSeller;
const markProductsOutOfStockIfNeeded = async (_client, _productIds) => {
    // Open marketplace: keep products visible (is_active) independent of stock.
    return;
};
exports.markProductsOutOfStockIfNeeded = markProductsOutOfStockIfNeeded;
//# sourceMappingURL=productLifecycleService.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePublishingAllowedForSeller = exports.ensureOrderAllowedForSeller = void 0;
const pool_1 = require("../db/pool");
const ensureOrderAllowedForSeller = async (sellerId, orderTotal) => {
    const { rows } = await pool_1.db.query(`SELECT seller_operational_mode, max_daily_orders_limit
     FROM seller_balance
     WHERE seller_id = $1`, [sellerId]);
    const mode = rows[0]?.seller_operational_mode ?? "NORMAL";
    if (mode === "ISOLATED") {
        return { allowed: false, reason: "Seller is isolated" };
    }
    if (mode === "STABILITY_LIMITED") {
        const limit = rows[0]?.max_daily_orders_limit ?? 0;
        const ordersToday = await pool_1.db.query(`SELECT COUNT(*)::int AS count
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_user_id = $1
         AND o.created_at >= DATE_TRUNC('day', NOW())`, [sellerId]);
        if (limit > 0 && Number(ordersToday.rows[0]?.count ?? 0) >= limit) {
            return { allowed: false, reason: "Daily order limit reached" };
        }
    }
    if (mode === "FINANCIAL_RISK" && orderTotal >= 100000) {
        return { allowed: false, reason: "High-value order restricted" };
    }
    return { allowed: true };
};
exports.ensureOrderAllowedForSeller = ensureOrderAllowedForSeller;
const ensurePublishingAllowedForSeller = async (sellerId) => {
    const { rows } = await pool_1.db.query(`SELECT seller_operational_mode
     FROM seller_balance
     WHERE seller_id = $1`, [sellerId]);
    const mode = rows[0]?.seller_operational_mode ?? "NORMAL";
    if (mode === "ISOLATED") {
        return { allowed: false, reason: "Seller is isolated" };
    }
    return { allowed: true };
};
exports.ensurePublishingAllowedForSeller = ensurePublishingAllowedForSeller;
//# sourceMappingURL=sellerModeEnforcer.js.map
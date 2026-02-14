"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveProduct = void 0;
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
const approveProduct = async (productId, adminUserId) => {
    const { rows } = await pool_1.db.query(`UPDATE products
     SET status = 'LIVE',
         is_approved = TRUE,
         approved_at = NOW(),
         approved_by = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status`, [productId, adminUserId]);
    if (!rows[0]) {
        return null;
    }
    await (0, audit_1.logAudit)({
        entityType: "product",
        entityId: productId,
        action: "product_approved",
        fromState: null,
        toState: rows[0].status,
        actorType: "admin",
        actorId: adminUserId,
        metadata: {}
    });
    return rows[0];
};
exports.approveProduct = approveProduct;
//# sourceMappingURL=productsService.js.map
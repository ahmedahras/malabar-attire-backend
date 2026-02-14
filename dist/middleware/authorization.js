"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRefundPermission = exports.requireReturnAccess = exports.requireOrderAccess = exports.requireShopOwnership = void 0;
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
const policies_1 = require("../utils/policies");
const getActor = (req) => {
    if (!req.user) {
        return null;
    }
    return { id: req.user.sub, role: req.user.role };
};
const auditUnauthorized = async (req, entityType, entityId) => {
    const actor = getActor(req);
    if (!actor) {
        return;
    }
    await (0, audit_1.logAudit)({
        entityType,
        entityId: entityId ?? "00000000-0000-0000-0000-000000000000",
        action: "unauthorized_access",
        actorType: actor.role,
        actorId: actor.id,
        metadata: { path: req.path, method: req.method }
    });
};
const requireShopOwnership = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopIdHeader = req.headers["x-shop-id"];
    const shopId = Array.isArray(shopIdHeader) ? shopIdHeader[0] : shopIdHeader;
    if (!shopId || typeof shopId !== "string") {
        return res.status(400).json({ error: "Missing shop context" });
    }
    const { rows } = await pool_1.db.query(`SELECT id FROM shops WHERE id = $1 AND owner_user_id = $2`, [shopId, req.user.sub]);
    if (!rows[0]) {
        await auditUnauthorized(req, "shop", shopId);
        return res.status(403).json({ error: "Invalid shop ownership" });
    }
    req.shopId = shopId;
    return next();
};
exports.requireShopOwnership = requireShopOwnership;
const requireOrderAccess = (orderIdKey = "id") => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Missing token" });
        }
        const raw = req.params[orderIdKey] ?? req.body?.[orderIdKey] ?? req.query?.[orderIdKey];
        const orderId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
        if (!orderId) {
            return res.status(400).json({ error: "Missing order id" });
        }
        const { rows } = await pool_1.db.query(`SELECT o.user_id, s.owner_user_id AS seller_id
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1`, [orderId]);
        if (!rows[0]) {
            return res.status(404).json({ error: "Order not found" });
        }
        const actor = getActor(req);
        const allowed = (0, policies_1.canAccessOrder)(actor, {
            userId: rows[0].user_id,
            sellerId: rows[0].seller_id
        });
        if (!allowed) {
            await auditUnauthorized(req, "order", orderId);
            return res.status(403).json({ error: "Forbidden" });
        }
        return next();
    };
};
exports.requireOrderAccess = requireOrderAccess;
const requireReturnAccess = () => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Missing token" });
        }
        const returnId = String(req.params.id);
        if (!returnId) {
            return res.status(400).json({ error: "Missing return id" });
        }
        const { rows } = await pool_1.db.query(`SELECT user_id, seller_id, status, seller_decision
       FROM return_requests
       WHERE id = $1`, [returnId]);
        if (!rows[0]) {
            return res.status(404).json({ error: "Return not found" });
        }
        const actor = getActor(req);
        const allowed = (0, policies_1.canModifyReturn)(actor, {
            userId: rows[0].user_id,
            sellerId: rows[0].seller_id,
            status: rows[0].status,
            sellerDecision: rows[0].seller_decision
        });
        if (!allowed) {
            await auditUnauthorized(req, "return", returnId);
            return res.status(403).json({ error: "Forbidden" });
        }
        return next();
    };
};
exports.requireReturnAccess = requireReturnAccess;
const requireRefundPermission = () => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Missing token" });
        }
        const actor = getActor(req);
        if (!(0, policies_1.canIssueRefund)(actor, "return")) {
            await auditUnauthorized(req, "return_refund");
            return res.status(403).json({ error: "Forbidden" });
        }
        return next();
    };
};
exports.requireRefundPermission = requireRefundPermission;
//# sourceMappingURL=authorization.js.map
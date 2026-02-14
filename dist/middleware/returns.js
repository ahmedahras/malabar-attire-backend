"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRefundEligibility = exports.validateReturnTransition = exports.requireDeliveredOrderForReturn = void 0;
const pool_1 = require("../db/pool");
const returnsService_1 = require("../services/returnsService");
const requireDeliveredOrderForReturn = async (req, res, next) => {
    const { orderId } = req.body;
    if (!orderId) {
        return res.status(400).json({ error: "Missing orderId" });
    }
    const { rows } = await pool_1.db.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    if (!rows[0]) {
        return res.status(404).json({ error: "Order not found" });
    }
    if (rows[0].status !== "DELIVERED") {
        return res.status(409).json({ error: "Return allowed only for delivered orders" });
    }
    return next();
};
exports.requireDeliveredOrderForReturn = requireDeliveredOrderForReturn;
const validateReturnTransition = async (req, res, next) => {
    const returnId = String(req.params.id);
    const nextStatus = req.body?.status;
    if (!returnId) {
        return res.status(400).json({ error: "Missing return id" });
    }
    if (!nextStatus) {
        return res.status(400).json({ error: "Missing status" });
    }
    const returnRequest = await (0, returnsService_1.getReturnRequest)(returnId);
    if (!returnRequest) {
        return res.status(404).json({ error: "Return not found" });
    }
    const currentStatus = returnRequest.status;
    const allowed = returnsService_1.allowedTransitions[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
        return res.status(409).json({ error: "Invalid state transition" });
    }
    if (nextStatus === "SELLER_REVIEW" && !returnRequest.video_proof_url) {
        return res.status(409).json({ error: "Video proof required for seller review" });
    }
    req.returnRequest = returnRequest;
    return next();
};
exports.validateReturnTransition = validateReturnTransition;
const validateRefundEligibility = async (req, res, next) => {
    const returnId = String(req.params.id);
    if (!returnId) {
        return res.status(400).json({ error: "Missing return id" });
    }
    const returnRequest = await (0, returnsService_1.getReturnRequest)(returnId);
    if (!returnRequest) {
        return res.status(404).json({ error: "Return not found" });
    }
    if (returnRequest.status !== "RECEIVED_BY_SELLER") {
        return res
            .status(409)
            .json({ error: "Refund allowed only after seller receives the item" });
    }
    if (returnRequest.seller_decision !== "APPROVED") {
        return res.status(409).json({ error: "Refund requires seller approval" });
    }
    req.returnRequest = returnRequest;
    return next();
};
exports.validateRefundEligibility = validateRefundEligibility;
//# sourceMappingURL=returns.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logReturnStatusChange = exports.getReturnRequest = exports.allowedTransitions = void 0;
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
exports.allowedTransitions = {
    REQUESTED: ["SELLER_REVIEW"],
    SELLER_REVIEW: ["APPROVED", "REJECTED"],
    APPROVED: ["RETURN_IN_TRANSIT"],
    REJECTED: ["DISPUTED"],
    RETURN_IN_TRANSIT: ["RECEIVED_BY_SELLER"],
    RECEIVED_BY_SELLER: ["REFUNDED"],
    REFUNDED: [],
    DISPUTED: ["ADMIN_APPROVED", "ADMIN_REJECTED", "ADMIN_REVIEW"],
    ADMIN_REVIEW: ["ADMIN_APPROVED", "ADMIN_REJECTED"],
    ADMIN_APPROVED: ["REFUNDED"],
    ADMIN_REJECTED: []
};
const getReturnRequest = async (returnId) => {
    const { rows } = await pool_1.db.query(`SELECT id, order_id, user_id, seller_id, status, seller_decision, video_proof_url
     FROM return_requests
     WHERE id = $1`, [returnId]);
    return rows[0];
};
exports.getReturnRequest = getReturnRequest;
const logReturnStatusChange = async (client, returnRequestId, fromStatus, toStatus, changedBy, note, actorType = "system") => {
    await client.query(`INSERT INTO return_status_history
     (return_request_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`, [returnRequestId, fromStatus, toStatus, changedBy ?? null, note ?? null]);
    await (0, audit_1.logAudit)({
        entityType: "return",
        entityId: returnRequestId,
        action: "status_change",
        fromState: fromStatus,
        toState: toStatus,
        actorType,
        actorId: changedBy ?? null,
        metadata: note ? { note } : {},
        client
    });
};
exports.logReturnStatusChange = logReturnStatusChange;
//# sourceMappingURL=returnsService.js.map
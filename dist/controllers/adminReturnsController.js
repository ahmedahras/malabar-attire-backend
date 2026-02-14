"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminReviewReturn = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const enqueue_1 = require("../jobs/enqueue");
const returnsService_1 = require("../services/returnsService");
const audit_1 = require("../utils/audit");
const adminReviewSchema = zod_1.z.object({
    decision: zod_1.z.enum(["ADMIN_APPROVED", "ADMIN_REJECTED"]),
    overrideReason: zod_1.z.string().min(3)
});
const ensureTransitionAllowed = (currentStatus, nextStatus) => {
    const allowed = returnsService_1.allowedTransitions[currentStatus] ?? [];
    return allowed.includes(nextStatus);
};
const adminReviewReturn = async (req, res) => {
    const body = adminReviewSchema.parse(req.body);
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const returnId = String(req.params.id);
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id, status, order_id
       FROM return_requests
       WHERE id = $1`, [returnId]);
        const current = rows[0];
        if (!current) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Return not found" });
        }
        if (!ensureTransitionAllowed(current.status, body.decision)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "Invalid state transition" });
        }
        await client.query(`UPDATE return_requests
       SET status = $1,
           decision_source = 'ADMIN',
           override_reason = $2,
           updated_at = NOW()
       WHERE id = $3`, [body.decision, body.overrideReason, returnId]);
        await (0, returnsService_1.logReturnStatusChange)(client, returnId, current.status, body.decision, req.user.sub, "Admin review", "admin");
        await (0, audit_1.logAudit)({
            entityType: "return",
            entityId: returnId,
            action: "admin_override",
            actorType: "admin",
            actorId: req.user.sub,
            metadata: { decision: body.decision, overrideReason: body.overrideReason }
        });
        await client.query("COMMIT");
        if (body.decision === "ADMIN_APPROVED") {
            await (0, enqueue_1.enqueueRefundJob)(returnId);
        }
        return res.json({ id: returnId, status: body.decision });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.adminReviewReturn = adminReviewReturn;
//# sourceMappingURL=adminReturnsController.js.map
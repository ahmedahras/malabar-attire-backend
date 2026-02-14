"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueMetrics = exports.getCacheStats = exports.unblockProduct = exports.blockProduct = exports.updateSellerFinancialMode = exports.toggleJobsEnabled = exports.toggleFinanceFreeze = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
const cache_1 = require("../utils/cache");
const metrics_1 = require("../utils/metrics");
const queues_1 = require("../jobs/queues");
const financeFreezeSchema = zod_1.z.object({
    freeze: zod_1.z.coerce.boolean(),
    reason: zod_1.z.string().max(500).optional()
});
const jobsToggleSchema = zod_1.z.object({
    enabled: zod_1.z.coerce.boolean()
});
const sellerModeSchema = zod_1.z.object({
    mode: zod_1.z.enum(["NORMAL", "MONITORED", "ISOLATED", "BLOCKED"]),
    reason: zod_1.z.string().max(500).optional()
});
const productBlockSchema = zod_1.z.object({
    reason: zod_1.z.string().max(500).optional()
});
const productUnblockSchema = zod_1.z.object({
    reason: zod_1.z.string().max(500).optional()
});
const SYSTEM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";
const invalidateAdminCaches = async () => {
    await (0, cache_1.invalidatePattern)("admin:analytics:overview:*");
    await (0, cache_1.invalidatePattern)("admin:alerts:*");
    await (0, cache_1.invalidatePattern)("admin:stats:*");
};
const toggleFinanceFreeze = async (req, res) => {
    const body = financeFreezeSchema.parse(req.body ?? {});
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        await client.query(`UPDATE system_state
       SET finance_frozen = $1,
           payouts_frozen = $1,
           freeze_reason = $2,
           updated_at = NOW()
       WHERE id = 1`, [body.freeze, body.freeze ? body.reason ?? "admin_action" : null]);
        await (0, audit_1.logAudit)({
            entityType: "finance",
            entityId: SYSTEM_ENTITY_ID,
            action: "FINANCE_FREEZE_UPDATED",
            actorType: "admin",
            actorId: req.user?.sub ?? null,
            metadata: { freeze: body.freeze, reason: body.reason ?? null },
            client
        });
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
    await (0, cache_1.invalidatePattern)("cache:admin:*");
    await invalidateAdminCaches();
    return res.json({ freeze: body.freeze });
};
exports.toggleFinanceFreeze = toggleFinanceFreeze;
const toggleJobsEnabled = async (req, res) => {
    const body = jobsToggleSchema.parse(req.body ?? {});
    process.env.JOBS_ENABLED = body.enabled ? "true" : "false";
    await (0, audit_1.logAudit)({
        entityType: "system",
        entityId: "jobs",
        action: "JOBS_ENABLED_UPDATED",
        actorType: "admin",
        actorId: req.user?.sub ?? null,
        metadata: { enabled: body.enabled }
    });
    await (0, cache_1.invalidatePattern)("cache:admin:*");
    await invalidateAdminCaches();
    return res.json({ enabled: body.enabled });
};
exports.toggleJobsEnabled = toggleJobsEnabled;
const updateSellerFinancialMode = async (req, res) => {
    const sellerId = String(req.params.id);
    const body = sellerModeSchema.parse(req.body ?? {});
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`UPDATE seller_balance
       SET seller_financial_mode = $2,
           updated_at = NOW()
       WHERE seller_id = $1
       RETURNING seller_id, seller_financial_mode`, [sellerId, body.mode]);
        if (!rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Seller not found" });
        }
        const ordersBlocked = body.mode === "BLOCKED";
        await client.query(`UPDATE shops
       SET orders_blocked = $2
       WHERE owner_user_id = $1`, [sellerId, ordersBlocked]);
        await (0, audit_1.logAudit)({
            entityType: "seller_balance",
            entityId: sellerId,
            action: "SELLER_FINANCIAL_MODE_MANUAL_OVERRIDE",
            actorType: "admin",
            actorId: req.user?.sub ?? null,
            metadata: { mode: body.mode, reason: body.reason ?? null },
            client
        });
        await client.query("COMMIT");
        await (0, cache_1.invalidatePattern)("cache:admin:*");
        await invalidateAdminCaches();
        return res.json({ sellerId, mode: body.mode });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.updateSellerFinancialMode = updateSellerFinancialMode;
const blockProduct = async (req, res) => {
    const productId = String(req.params.id);
    const body = productBlockSchema.parse(req.body ?? {});
    try {
        const { rows } = await pool_1.db.query(`UPDATE products
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING id`, [productId]);
        if (!rows[0]) {
            return res.status(404).json({ error: "Product not found" });
        }
        await (0, audit_1.logAudit)({
            entityType: "product",
            entityId: productId,
            action: "product_disabled",
            actorType: "admin",
            actorId: req.user?.sub ?? null,
            metadata: { reason: body.reason ?? null }
        });
        await (0, cache_1.invalidatePattern)("cache:products:*");
        await (0, cache_1.invalidatePattern)("cache:admin:*");
        await invalidateAdminCaches();
        return res.json({ id: productId, isActive: false });
    }
    catch (error) {
        throw error;
    }
};
exports.blockProduct = blockProduct;
const unblockProduct = async (req, res) => {
    const productId = String(req.params.id);
    const body = productUnblockSchema.parse(req.body ?? {});
    try {
        const { rows } = await pool_1.db.query(`UPDATE products
       SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id`, [productId]);
        if (!rows[0]) {
            return res.status(404).json({ error: "Product not found" });
        }
        await (0, audit_1.logAudit)({
            entityType: "product",
            entityId: productId,
            action: "product_enabled",
            actorType: "admin",
            actorId: req.user?.sub ?? null,
            metadata: { reason: body.reason ?? null }
        });
        await (0, cache_1.invalidatePattern)("cache:products:*");
        await (0, cache_1.invalidatePattern)("cache:admin:*");
        await invalidateAdminCaches();
        return res.json({ id: productId, isActive: true });
    }
    catch (error) {
        throw error;
    }
};
exports.unblockProduct = unblockProduct;
const getCacheStats = async (_req, res) => {
    return res.json((0, cache_1.cacheStats)());
};
exports.getCacheStats = getCacheStats;
const getQueueMetrics = async (_req, res) => {
    const queues = {
        automation: (0, queues_1.getAutomationQueue)(),
        refunds: (0, queues_1.getRefundsQueue)(),
        notifications: (0, queues_1.getNotificationsQueue)(),
        notificationDelivery: (0, queues_1.getNotificationDeliveryQueue)(),
        events: (0, queues_1.getEventsQueue)()
    };
    const counts = await Promise.all(Object.entries(queues).map(async ([key, queue]) => {
        const stats = await queue.getJobCounts("waiting", "active", "delayed", "failed", "paused");
        return [key, stats];
    }));
    const queueCounts = Object.fromEntries(counts);
    const queued = Object.values(queueCounts).reduce((sum, stat) => sum + (stat.waiting ?? 0) + (stat.active ?? 0) + (stat.delayed ?? 0), 0);
    const failed = Object.values(queueCounts).reduce((sum, stat) => sum + (stat.failed ?? 0), 0);
    const { rows: retryRows } = await pool_1.db.query(`SELECT COUNT(*)::int AS count
     FROM job_logs
     WHERE status = 'failed' AND attempts > 0`);
    const retried = Number(retryRows[0]?.count ?? 0);
    const deadLetterStats = await (0, queues_1.getDeadLetterQueue)().getJobCounts("waiting", "active", "delayed", "failed", "paused");
    const deadLetter = (deadLetterStats.waiting ?? 0) +
        (deadLetterStats.active ?? 0) +
        (deadLetterStats.delayed ?? 0) +
        (deadLetterStats.failed ?? 0) +
        (deadLetterStats.paused ?? 0);
    return res.json({
        queued,
        failed,
        retried,
        deadLetter,
        queues: queueCounts,
        counters: (0, metrics_1.getMetrics)()
    });
};
exports.getQueueMetrics = getQueueMetrics;
//# sourceMappingURL=adminControlController.js.map
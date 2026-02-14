"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRouter = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
exports.metricsRouter = (0, express_1.Router)();
exports.metricsRouter.get("/", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), async (_req, res) => {
    const windowHours = 24;
    const [ordersResult, refundsResult, returnsResult, disputesResult, jobsResult, jobsFailedResult] = await Promise.all([
        pool_1.db.query(`SELECT date_trunc('hour', placed_at) AS hour, COUNT(*)::int AS count
         FROM orders
         WHERE placed_at >= NOW() - ($1 || ' hours')::interval
         GROUP BY 1
         ORDER BY 1`, [windowHours]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM return_requests
         WHERE status = 'REFUNDED'
           AND requested_at >= NOW() - ($1 || ' hours')::interval`, [windowHours]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM return_requests
         WHERE requested_at >= NOW() - ($1 || ' hours')::interval`, [windowHours]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM return_requests
         WHERE status IN ('DISPUTED', 'ADMIN_REVIEW')
           AND updated_at >= NOW() - ($1 || ' hours')::interval`, [windowHours]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM job_logs
         WHERE created_at >= NOW() - ($1 || ' hours')::interval`, [windowHours]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM job_logs
         WHERE status = 'failed'
           AND created_at >= NOW() - ($1 || ' hours')::interval`, [windowHours])
    ]);
    const refunds = refundsResult.rows[0]?.count ?? 0;
    const returns = returnsResult.rows[0]?.count ?? 0;
    const disputes = disputesResult.rows[0]?.count ?? 0;
    const jobs = jobsResult.rows[0]?.count ?? 0;
    const jobsFailed = jobsFailedResult.rows[0]?.count ?? 0;
    return res.json({
        windowHours,
        ordersPerHour: ordersResult.rows.map((row) => ({
            hour: row.hour,
            count: row.count
        })),
        refundRate: returns === 0 ? 0 : refunds / returns,
        disputeRate: returns === 0 ? 0 : disputes / returns,
        jobFailureRate: jobs === 0 ? 0 : jobsFailed / jobs
    });
});
//# sourceMappingURL=metrics.js.map
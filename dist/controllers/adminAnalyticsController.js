"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsNotifications = exports.getAnalyticsQualityRisk = exports.getAnalyticsRefunds = exports.getAnalyticsOrders = exports.getAnalyticsOverview = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const cache_1 = require("../utils/cache");
const case_1 = require("../utils/case");
const rangeSchema = zod_1.z.object({
    range: zod_1.z.enum(["7", "30", "90"]).optional(),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    sellerId: zod_1.z.string().uuid().optional(),
    shopId: zod_1.z.string().uuid().optional()
});
const buildCacheKey = (base, query) => {
    const entries = Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
    return `${base}:${JSON.stringify(entries)}`;
};
const resolveRange = (query) => {
    if (query.from || query.to) {
        const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
        const to = query.to ? new Date(query.to) : new Date();
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
            throw new Error("Invalid date range");
        }
        return { from: from.toISOString(), to: to.toISOString(), range: "custom" };
    }
    const days = Number(query.range ?? "30");
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    return { from: from.toISOString(), to: to.toISOString(), range: String(days) };
};
const applyOrderFilters = (input, params, where, joins) => {
    if (input.shopId) {
        params.push(input.shopId);
        where.push(`o.shop_id = $${params.length}`);
    }
    if (input.sellerId) {
        joins.push("INNER JOIN shops s ON s.id = o.shop_id");
        params.push(input.sellerId);
        where.push(`s.owner_user_id = $${params.length}`);
    }
};
const getAnalyticsOverview = async (req, res) => {
    console.log("HANDLER_ID:", __filename);
    console.log("HANDLER_FN_STRING:", exports.getAnalyticsOverview.toString().slice(0, 120));
    const query = rangeSchema.parse(req.query);
    const { from, to, range } = resolveRange(query);
    const cacheKey = `admin:analytics:overview:${range}`;
    const data = await (0, cache_1.getWithRefresh)(cacheKey, 60, async () => {
        const params = [from, to];
        const where = ["o.placed_at >= $1", "o.placed_at <= $2"];
        const joins = [];
        applyOrderFilters(query, params, where, joins);
        const orderClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const orderJoin = joins.join(" ");
        const refundParams = [from, to];
        const refundWhere = ["r.created_at >= $1", "r.created_at <= $2"];
        const refundJoins = [];
        applyOrderFilters(query, refundParams, refundWhere, refundJoins);
        const refundClause = refundWhere.length ? `WHERE ${refundWhere.join(" AND ")}` : "";
        const refundJoin = refundJoins.join(" ");
        const [ordersResult, refundsResult, payoutsResult, alertsResult, riskResult, stockResult, deliveryResult] = await Promise.all([
            pool_1.db.query(`SELECT COUNT(*)::int AS order_count, COALESCE(SUM(o.total_amount), 0)::numeric AS gmv
           FROM orders o
           ${orderJoin}
           ${orderClause}`, params),
            pool_1.db.query(`SELECT COUNT(*)::int AS refund_count, COALESCE(SUM(r.amount), 0)::numeric AS refund_total
           FROM order_refunds r
           INNER JOIN orders o ON o.id = r.order_id
           ${refundJoin}
           ${refundClause}`, refundParams),
            pool_1.db.query(`SELECT COALESCE(SUM(p.amount), 0)::numeric AS payout_total
           FROM seller_payouts p
           WHERE p.status = 'COMPLETED'
             AND p.created_at >= $1 AND p.created_at <= $2`, [from, to]),
            pool_1.db.query(`SELECT COUNT(*)::int AS active_alerts
           FROM finance_alerts
           WHERE resolved = FALSE`, []),
            pool_1.db.query(`SELECT COUNT(*)::int AS risky_sellers
           FROM seller_balance
           WHERE risk_flag = TRUE`, []),
            pool_1.db.query(`SELECT COUNT(*)::int AS stock_outs
           FROM products
           WHERE status = 'OUT_OF_STOCK'`, []),
            pool_1.db.query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
                  COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                  COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
           FROM notification_deliveries
           WHERE created_at >= $1 AND created_at <= $2`, [from, to])
        ]);
        const orderCount = Number(ordersResult.rows[0]?.order_count ?? 0);
        const refundCount = Number(refundsResult.rows[0]?.refund_count ?? 0);
        const deliveryTotal = Number(deliveryResult.rows[0]?.total ?? 0);
        const deliverySent = Number(deliveryResult.rows[0]?.sent ?? 0);
        return {
            range,
            from,
            to,
            gmv: ordersResult.rows[0]?.gmv ?? 0,
            orderCount,
            refundTotal: refundsResult.rows[0]?.refund_total ?? 0,
            refundRate: orderCount ? refundCount / orderCount : 0,
            payoutTotal: payoutsResult.rows[0]?.payout_total ?? 0,
            activeAlerts: alertsResult.rows[0]?.active_alerts ?? 0,
            riskySellers: riskResult.rows[0]?.risky_sellers ?? 0,
            stockOuts: stockResult.rows[0]?.stock_outs ?? 0,
            notificationDelivery: {
                total: deliveryTotal,
                sent: deliverySent,
                failed: Number(deliveryResult.rows[0]?.failed ?? 0),
                pending: Number(deliveryResult.rows[0]?.pending ?? 0),
                successRate: deliveryTotal ? deliverySent / deliveryTotal : 0
            }
        };
    });
    return res.json(data);
};
exports.getAnalyticsOverview = getAnalyticsOverview;
const getAnalyticsOrders = async (req, res) => {
    const query = rangeSchema.parse(req.query);
    const { from, to, range } = resolveRange(query);
    const cacheKey = buildCacheKey("cache:admin:analytics:orders", {
        from,
        to,
        range,
        sellerId: query.sellerId,
        shopId: query.shopId
    });
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const params = [from, to];
    const where = ["o.placed_at >= $1", "o.placed_at <= $2"];
    const joins = [];
    applyOrderFilters(query, params, where, joins);
    const orderClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderJoin = joins.join(" ");
    const { rows } = await pool_1.db.query(`WITH daily AS (
       SELECT date_trunc('day', o.placed_at)::date AS day,
              COUNT(*)::int AS total_orders,
              COALESCE(SUM(o.total_amount), 0)::numeric AS gmv,
              COUNT(*) FILTER (WHERE o.status = 'CREATED')::int AS created,
              COUNT(*) FILTER (WHERE o.status = 'PAID')::int AS paid,
              COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
              COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::int AS cancelled
       FROM orders o
       ${orderJoin}
       ${orderClause}
       GROUP BY day
     )
     SELECT d::date AS date,
            COALESCE(daily.total_orders, 0) AS total_orders,
            COALESCE(daily.gmv, 0) AS gmv,
            COALESCE(daily.created, 0) AS created,
            COALESCE(daily.paid, 0) AS paid,
            COALESCE(daily.delivered, 0) AS delivered,
            COALESCE(daily.cancelled, 0) AS cancelled
     FROM generate_series($1::date, $2::date, '1 day') AS d
     LEFT JOIN daily ON daily.day = d
     ORDER BY d`, params);
    const response = {
        range,
        from,
        to,
        items: rows.map((row) => (0, case_1.keysToCamel)(row))
    };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getAnalyticsOrders = getAnalyticsOrders;
const getAnalyticsRefunds = async (req, res) => {
    const query = rangeSchema.parse(req.query);
    const { from, to, range } = resolveRange(query);
    const cacheKey = buildCacheKey("cache:admin:analytics:refunds", {
        from,
        to,
        range,
        sellerId: query.sellerId,
        shopId: query.shopId
    });
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const params = [from, to];
    const where = ["o.placed_at >= $1", "o.placed_at <= $2"];
    const joins = [];
    applyOrderFilters(query, params, where, joins);
    const orderClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderJoin = joins.join(" ");
    const { rows } = await pool_1.db.query(`SELECT COUNT(*)::int AS refund_count,
            COALESCE(SUM(r.amount), 0)::numeric AS refund_total,
            AVG(EXTRACT(EPOCH FROM (r.completed_at - r.created_at))) AS avg_completion_seconds,
            COUNT(*) FILTER (
              WHERE r.completed_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) < 3600
            )::int AS bucket_under_1h,
            COUNT(*) FILTER (
              WHERE r.completed_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) >= 3600
                AND EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) < 86400
            )::int AS bucket_1h_24h,
            COUNT(*) FILTER (
              WHERE r.completed_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) >= 86400
            )::int AS bucket_over_24h
     FROM order_refunds r
     INNER JOIN orders o ON o.id = r.order_id
     ${orderJoin}
     ${orderClause}`, params);
    const response = {
        range,
        from,
        to,
        refunds: (0, case_1.keysToCamel)(rows[0] ?? {})
    };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getAnalyticsRefunds = getAnalyticsRefunds;
const getAnalyticsQualityRisk = async (req, res) => {
    const query = rangeSchema.parse(req.query);
    const { from, to, range } = resolveRange(query);
    const cacheKey = buildCacheKey("cache:admin:analytics:quality-risk", {
        from,
        to,
        range
    });
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const [productResult, riskLevelResult, riskRatesResult] = await Promise.all([
        pool_1.db.query(`SELECT COUNT(*)::int AS submitted,
              COUNT(*) FILTER (WHERE approved_at IS NOT NULL)::int AS approved
       FROM products
       WHERE submitted_at >= $1 AND submitted_at <= $2`, [from, to]),
        pool_1.db.query(`SELECT risk_level, COUNT(*)::int AS count
       FROM seller_risk_metrics
       GROUP BY risk_level`, []),
        pool_1.db.query(`SELECT AVG(chargeback_rate_7d)::numeric AS chargeback_rate_7d,
              AVG(chargeback_rate_30d)::numeric AS chargeback_rate_30d,
              AVG(delivery_success_rate)::numeric AS delivery_success_rate
       FROM seller_risk_metrics`, [])
    ]);
    const submitted = Number(productResult.rows[0]?.submitted ?? 0);
    const approved = Number(productResult.rows[0]?.approved ?? 0);
    const response = {
        range,
        from,
        to,
        productApproval: {
            submitted,
            approved,
            approvalRate: submitted ? approved / submitted : 0
        },
        sellerRiskDistribution: riskLevelResult.rows.map((row) => ({
            riskLevel: row.risk_level,
            count: Number(row.count ?? 0)
        })),
        riskRates: (0, case_1.keysToCamel)(riskRatesResult.rows[0] ?? {})
    };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getAnalyticsQualityRisk = getAnalyticsQualityRisk;
const getAnalyticsNotifications = async (req, res) => {
    const query = rangeSchema.parse(req.query);
    const { from, to, range } = resolveRange(query);
    const cacheKey = buildCacheKey("cache:admin:analytics:notifications", {
        from,
        to,
        range
    });
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const { rows } = await pool_1.db.query(`SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
            COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
            AVG(attempts)::numeric AS avg_attempts
     FROM notification_deliveries
     WHERE created_at >= $1 AND created_at <= $2`, [from, to]);
    const response = {
        range,
        from,
        to,
        deliveries: (0, case_1.keysToCamel)(rows[0] ?? {})
    };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getAnalyticsNotifications = getAnalyticsNotifications;
//# sourceMappingURL=adminAnalyticsController.js.map
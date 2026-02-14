"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreAllSellers = exports.calculateSellerRisk = void 0;
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
const audit_1 = require("../utils/audit");
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));
const applyDecay = (recent, older) => 0.7 * recent + 0.3 * older;
const computeRiskScore = (inputs, previousScore) => {
    const chargebackRate = applyDecay(inputs.chargebackRate7d, inputs.chargebackRate30d);
    const riskComponents = clamp01(chargebackRate) * 0.22 +
        clamp01(inputs.refundRatio) * 0.15 +
        clamp01(inputs.rtoRate) * 0.08 +
        clamp01(inputs.orderGrowthSpike) * 0.12 +
        clamp01(inputs.failedDeliveryRate) * 0.1 +
        clamp01(inputs.unsettledPayoutExposure / 100000) * 0.1 +
        clamp01(inputs.complaintRate) * 0.08 +
        clamp01(inputs.paymentFraudFlags / 10) * 0.05;
    const trustComponents = clamp01(inputs.deliverySuccessRate) * 0.06 +
        clamp01(inputs.sellerAgeDays / 365) * 0.04;
    const rawScore = (riskComponents - trustComponents) * 100;
    const score = clampScore(rawScore);
    const riskLevel = score >= env_1.env.RISK_SCORE_CRITICAL
        ? "BLOCKED"
        : score >= env_1.env.RISK_SCORE_THRESHOLD + 15
            ? "ISOLATED"
            : score >= env_1.env.RISK_SCORE_THRESHOLD
                ? "MONITORED"
                : "NORMAL";
    const trend = score - previousScore >= 5 ? "worsening" : previousScore - score >= 5 ? "improving" : "stable";
    return {
        score,
        riskLevel,
        trend,
        metrics: {
            ...inputs,
            chargebackRate7d: chargebackRate
        },
        payoutHold: riskLevel === "ISOLATED" || riskLevel === "BLOCKED",
        riskWatch: riskLevel !== "NORMAL"
    };
};
const getSellerMetrics = async (sellerId) => {
    const [chargeback7d, chargeback30d, refunds, orders7d, orders30d, cancelled7d, delivered7d, fraudFlags, balance, sellerAge] = await Promise.all([
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'CHARGEBACK'
           AND created_at >= NOW() - '7 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'CHARGEBACK'
           AND created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'REFUND'
           AND created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0)::numeric AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1 AND o.created_at >= NOW() - '7 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0)::numeric AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1 AND o.created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.status = 'CANCELLED'
           AND o.created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.status IN ('DELIVERED', 'COMPLETED')
           AND o.created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM payment_intents pi
         INNER JOIN orders o ON o.id = pi.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND pi.metadata->>'fraud' = 'true'
           AND pi.created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT pending_amount, reserve_amount
         FROM seller_balance
         WHERE seller_id = $1`, [sellerId]),
        pool_1.db.query(`SELECT DATE_PART('day', NOW() - created_at)::int AS age_days
         FROM users
         WHERE id = $1`, [sellerId])
    ]);
    const orderCount7d = Number(orders7d.rows[0]?.count ?? 0);
    const orderCount30d = Number(orders30d.rows[0]?.count ?? 0);
    const orderCountPrev = Math.max(orderCount30d - orderCount7d, 0);
    const avgPrev7 = orderCountPrev / 4;
    const growthSpike = avgPrev7 <= 0 ? 0 : Math.max(0, (orderCount7d - avgPrev7) / avgPrev7);
    const totalSales30d = Number(orders30d.rows[0]?.total ?? 0);
    const refundRatio = totalSales30d === 0 ? 0 : Number(refunds.rows[0]?.refunds ?? 0) / totalSales30d;
    const cancelledRate = orderCount30d === 0 ? 0 : Number(cancelled7d.rows[0]?.count ?? 0) / orderCount30d;
    const deliverySuccess = orderCount30d === 0 ? 0 : Number(delivered7d.rows[0]?.count ?? 0) / orderCount30d;
    const pending = Number(balance.rows[0]?.pending_amount ?? 0);
    const reserve = Number(balance.rows[0]?.reserve_amount ?? 0);
    const exposure = Math.max(pending + reserve, 0);
    return {
        chargebackRate7d: orderCount7d === 0 ? 0 : Number(chargeback7d.rows[0]?.count ?? 0) / orderCount7d,
        chargebackRate30d: orderCount30d === 0 ? 0 : Number(chargeback30d.rows[0]?.count ?? 0) / orderCount30d,
        refundRatio,
        rtoRate: cancelledRate,
        orderGrowthSpike: growthSpike,
        failedDeliveryRate: cancelledRate,
        unsettledPayoutExposure: exposure,
        sellerAgeDays: Number(sellerAge.rows[0]?.age_days ?? 0),
        deliverySuccessRate: deliverySuccess,
        complaintRate: refundRatio,
        paymentFraudFlags: Number(fraudFlags.rows[0]?.count ?? 0)
    };
};
const calculateSellerRisk = async (sellerId) => {
    const previous = await pool_1.db.query(`SELECT risk_score, last_mode, last_mode_change_at, cooldown_until
     FROM seller_risk_metrics
     WHERE seller_id = $1`, [sellerId]);
    const previousScore = Number(previous.rows[0]?.risk_score ?? 0);
    const metrics = await getSellerMetrics(sellerId);
    const scoreResult = computeRiskScore(metrics, previousScore);
    const now = new Date();
    const lastMode = previous.rows[0]?.last_mode ?? "NORMAL";
    const cooldownUntil = previous.rows[0]?.cooldown_until
        ? new Date(previous.rows[0]?.cooldown_until)
        : null;
    let nextMode = scoreResult.riskLevel;
    if (cooldownUntil && now < cooldownUntil) {
        const severityOrder = ["NORMAL", "MONITORED", "ISOLATED", "BLOCKED"];
        if (severityOrder.indexOf(nextMode) < severityOrder.indexOf(lastMode)) {
            nextMode = lastMode;
        }
    }
    const modeChanged = nextMode !== lastMode;
    const cooldownHours = env_1.env.RISK_MODE_COOLDOWN_HOURS;
    const cooldown = new Date(now.getTime() + cooldownHours * 60 * 60 * 1000);
    await pool_1.db.query(`INSERT INTO seller_risk_metrics
     (seller_id, chargeback_rate_7d, chargeback_rate_30d, refund_ratio, rto_rate, order_growth_spike,
      failed_delivery_rate, unsettled_payout_exposure, seller_age_days, delivery_success_rate,
      complaint_rate, payment_fraud_flags, risk_score, risk_level, risk_trend, last_score,
      last_mode, last_mode_change_at, cooldown_until, last_scored_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
     ON CONFLICT (seller_id) DO UPDATE SET
       chargeback_rate_7d = EXCLUDED.chargeback_rate_7d,
       chargeback_rate_30d = EXCLUDED.chargeback_rate_30d,
       refund_ratio = EXCLUDED.refund_ratio,
       rto_rate = EXCLUDED.rto_rate,
       order_growth_spike = EXCLUDED.order_growth_spike,
       failed_delivery_rate = EXCLUDED.failed_delivery_rate,
       unsettled_payout_exposure = EXCLUDED.unsettled_payout_exposure,
       seller_age_days = EXCLUDED.seller_age_days,
       delivery_success_rate = EXCLUDED.delivery_success_rate,
       complaint_rate = EXCLUDED.complaint_rate,
       payment_fraud_flags = EXCLUDED.payment_fraud_flags,
       risk_score = EXCLUDED.risk_score,
       risk_level = EXCLUDED.risk_level,
       risk_trend = EXCLUDED.risk_trend,
       last_score = EXCLUDED.last_score,
       last_mode = EXCLUDED.last_mode,
       last_mode_change_at = EXCLUDED.last_mode_change_at,
       cooldown_until = EXCLUDED.cooldown_until,
       last_scored_at = NOW()`, [
        sellerId,
        metrics.chargebackRate7d,
        metrics.chargebackRate30d,
        metrics.refundRatio,
        metrics.rtoRate,
        metrics.orderGrowthSpike,
        metrics.failedDeliveryRate,
        metrics.unsettledPayoutExposure,
        metrics.sellerAgeDays,
        metrics.deliverySuccessRate,
        metrics.complaintRate,
        metrics.paymentFraudFlags,
        scoreResult.score,
        nextMode,
        scoreResult.trend,
        scoreResult.score,
        nextMode,
        modeChanged ? now : previous.rows[0]?.last_mode_change_at ?? null,
        modeChanged ? cooldown : previous.rows[0]?.cooldown_until ?? null
    ]);
    await pool_1.db.query(`UPDATE seller_balance
     SET seller_financial_mode = $2,
         risk_watch = $3,
         payout_hold = $4,
         risk_score = $5,
         last_score_at = NOW()
     WHERE seller_id = $1`, [sellerId, nextMode, scoreResult.riskWatch, scoreResult.payoutHold, scoreResult.score]);
    await (0, audit_1.logAudit)({
        entityType: "seller_balance",
        entityId: sellerId,
        action: "SELLER_RISK_SCORE_UPDATED",
        actorType: "system",
        metadata: {
            score: scoreResult.score,
            mode: nextMode,
            trend: scoreResult.trend,
            metrics
        }
    });
    if (modeChanged) {
        await (0, audit_1.logAudit)({
            entityType: "seller_balance",
            entityId: sellerId,
            action: "SELLER_FINANCIAL_MODE_UPDATED",
            actorType: "system",
            metadata: { from: lastMode, to: nextMode }
        });
    }
    return { score: scoreResult.score, mode: nextMode, trend: scoreResult.trend, metrics };
};
exports.calculateSellerRisk = calculateSellerRisk;
const scoreAllSellers = async () => {
    const sellers = await pool_1.db.query(`SELECT DISTINCT s.owner_user_id AS seller_id
     FROM shops s`, []);
    let scored = 0;
    for (const seller of sellers.rows) {
        await (0, exports.calculateSellerRisk)(seller.seller_id);
        const { evaluateSellerOperationalMode } = await Promise.resolve().then(() => __importStar(require("./sellerSafetyController")));
        await evaluateSellerOperationalMode(seller.seller_id);
        scored += 1;
    }
    return { scored };
};
exports.scoreAllSellers = scoreAllSellers;
//# sourceMappingURL=riskEngineService.js.map
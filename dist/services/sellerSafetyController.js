"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateSellerOperationalMode = void 0;
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
const productLifecycleService_1 = require("./productLifecycleService");
const getSellerSignals = async (sellerId) => {
    const [balanceResult, qualityResult, refundResult, delayResult, payoutFailResult] = await Promise.all([
        pool_1.db.query(`SELECT risk_score, seller_financial_mode, payout_hold, risk_flag
       FROM seller_balance
       WHERE seller_id = $1`, [sellerId]),
        pool_1.db.query(`SELECT seller_quality_score
       FROM seller_quality_metrics
       WHERE seller_id = $1`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(SUM(ra.amount), 0)::numeric AS refunds,
              COALESCE(SUM(o.total_amount), 0)::numeric AS sales
       FROM refund_adjustments ra
       INNER JOIN orders o ON o.id = ra.order_id
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_user_id = $1
         AND ra.created_at >= NOW() - '30 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS delayed, COUNT(*)::int AS total
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_user_id = $1
         AND o.status IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
         AND o.created_at >= NOW() - '30 days'::interval
         AND (o.updated_at - o.created_at) > '7 days'::interval`, [sellerId]),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
       FROM seller_payouts
       WHERE seller_id = $1 AND status = 'FAILED'
         AND created_at >= NOW() - '30 days'::interval`, [sellerId])
    ]);
    const balance = balanceResult.rows[0] ?? {};
    const quality = qualityResult.rows[0] ?? {};
    const refundSales = Number(refundResult.rows[0]?.sales ?? 0);
    const refundRate = refundSales === 0 ? 0 : Number(refundResult.rows[0]?.refunds ?? 0) / refundSales;
    const totalDelay = Number(delayResult.rows[0]?.total ?? 0);
    const delayRate = totalDelay === 0 ? 0 : Number(delayResult.rows[0]?.delayed ?? 0) / totalDelay;
    return {
        riskScore: Number(balance.risk_score ?? 0),
        financialMode: balance.seller_financial_mode ?? "NORMAL",
        payoutHold: Boolean(balance.payout_hold),
        riskFlag: Boolean(balance.risk_flag),
        qualityScore: Number(quality.seller_quality_score ?? 0),
        refundRate30d: refundRate,
        dispatchDelayRate: delayRate,
        openPayoutFailures: Number(payoutFailResult.rows[0]?.count ?? 0)
    };
};
const decideMode = (signals) => {
    if (signals.financialMode === "ISOLATED" || signals.riskFlag) {
        return "ISOLATED";
    }
    if (signals.payoutHold || signals.openPayoutFailures > 0) {
        return "FINANCIAL_RISK";
    }
    if (signals.qualityScore > 0 && signals.qualityScore < 55) {
        return "QUALITY_ISSUE";
    }
    if (signals.dispatchDelayRate > 0.2 || signals.refundRate30d > 0.2) {
        return "STABILITY_LIMITED";
    }
    if (signals.riskScore >= 60) {
        return "WATCH";
    }
    return "NORMAL";
};
const evaluateSellerOperationalMode = async (sellerId) => {
    const signals = await getSellerSignals(sellerId);
    const nextMode = decideMode(signals);
    const current = await pool_1.db.query(`SELECT seller_operational_mode
     FROM seller_balance
     WHERE seller_id = $1`, [sellerId]);
    const currentMode = current.rows[0]?.seller_operational_mode ?? "NORMAL";
    if (currentMode !== nextMode) {
        await pool_1.db.query(`UPDATE seller_balance
       SET seller_operational_mode = $2,
           last_operational_mode_at = NOW(),
           max_daily_orders_limit = $3
       WHERE seller_id = $1`, [
            sellerId,
            nextMode,
            nextMode === "STABILITY_LIMITED" ? 30 : null
        ]);
        await pool_1.db.query(`UPDATE shops
       SET visibility_multiplier = $2
       WHERE owner_user_id = $1`, [sellerId, nextMode === "QUALITY_ISSUE" ? 0.8 : 1.0]);
        await (0, audit_1.logAudit)({
            entityType: "seller_balance",
            entityId: sellerId,
            action: "SELLER_OPERATIONAL_MODE_UPDATED",
            actorType: "system",
            metadata: { from: currentMode, to: nextMode, signals }
        });
        if (nextMode === "ISOLATED") {
            await (0, productLifecycleService_1.blockProductsForSeller)(sellerId, "Seller entered ISOLATED mode");
        }
    }
    return { sellerId, mode: nextMode, signals };
};
exports.evaluateSellerOperationalMode = evaluateSellerOperationalMode;
//# sourceMappingURL=sellerSafetyController.js.map
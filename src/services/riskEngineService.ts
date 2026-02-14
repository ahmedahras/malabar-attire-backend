import { db } from "../db/pool";
import { env } from "../config/env";
import { logAudit } from "../utils/audit";

type RiskInputs = {
  chargebackRate7d: number;
  chargebackRate30d: number;
  refundRatio: number;
  rtoRate: number;
  orderGrowthSpike: number;
  failedDeliveryRate: number;
  unsettledPayoutExposure: number;
  sellerAgeDays: number;
  deliverySuccessRate: number;
  complaintRate: number;
  paymentFraudFlags: number;
};

type RiskScoreResult = {
  score: number;
  riskLevel: "NORMAL" | "MONITORED" | "ISOLATED" | "BLOCKED";
  trend: "improving" | "stable" | "worsening";
  metrics: RiskInputs;
  payoutHold: boolean;
  riskWatch: boolean;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const applyDecay = (recent: number, older: number) => 0.7 * recent + 0.3 * older;

const computeRiskScore = (inputs: RiskInputs, previousScore: number): RiskScoreResult => {
  const chargebackRate = applyDecay(inputs.chargebackRate7d, inputs.chargebackRate30d);

  const riskComponents =
    clamp01(chargebackRate) * 0.22 +
    clamp01(inputs.refundRatio) * 0.15 +
    clamp01(inputs.rtoRate) * 0.08 +
    clamp01(inputs.orderGrowthSpike) * 0.12 +
    clamp01(inputs.failedDeliveryRate) * 0.1 +
    clamp01(inputs.unsettledPayoutExposure / 100000) * 0.1 +
    clamp01(inputs.complaintRate) * 0.08 +
    clamp01(inputs.paymentFraudFlags / 10) * 0.05;

  const trustComponents =
    clamp01(inputs.deliverySuccessRate) * 0.06 +
    clamp01(inputs.sellerAgeDays / 365) * 0.04;

  const rawScore = (riskComponents - trustComponents) * 100;
  const score = clampScore(rawScore);

  const riskLevel =
    score >= env.RISK_SCORE_CRITICAL
      ? "BLOCKED"
      : score >= env.RISK_SCORE_THRESHOLD + 15
      ? "ISOLATED"
      : score >= env.RISK_SCORE_THRESHOLD
      ? "MONITORED"
      : "NORMAL";

  const trend =
    score - previousScore >= 5 ? "worsening" : previousScore - score >= 5 ? "improving" : "stable";

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

const getSellerMetrics = async (sellerId: string): Promise<RiskInputs> => {
  const [chargeback7d, chargeback30d, refunds, orders7d, orders30d, cancelled7d, delivered7d, fraudFlags, balance, sellerAge] =
    await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'CHARGEBACK'
           AND created_at >= NOW() - '7 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'CHARGEBACK'
           AND created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments
         WHERE seller_id = $1 AND type = 'REFUND'
           AND created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0)::numeric AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1 AND o.created_at >= NOW() - '7 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0)::numeric AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1 AND o.created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.status = 'CANCELLED'
           AND o.created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.status IN ('DELIVERED', 'COMPLETED')
           AND o.created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM payment_intents pi
         INNER JOIN orders o ON o.id = pi.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND pi.metadata->>'fraud' = 'true'
           AND pi.created_at >= NOW() - '30 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT pending_amount, reserve_amount
         FROM seller_balance
         WHERE seller_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT DATE_PART('day', NOW() - created_at)::int AS age_days
         FROM users
         WHERE id = $1`,
        [sellerId]
      )
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

export const calculateSellerRisk = async (sellerId: string) => {
  const previous = await db.query(
    `SELECT risk_score, last_mode, last_mode_change_at, cooldown_until
     FROM seller_risk_metrics
     WHERE seller_id = $1`,
    [sellerId]
  );
  const previousScore = Number(previous.rows[0]?.risk_score ?? 0);
  const metrics = await getSellerMetrics(sellerId);
  const scoreResult = computeRiskScore(metrics, previousScore);

  const now = new Date();
  const lastMode =
    (previous.rows[0]?.last_mode as
      | "BLOCKED"
      | "NORMAL"
      | "ISOLATED"
      | "MONITORED"
      | undefined) ?? "NORMAL";
  const cooldownUntil = previous.rows[0]?.cooldown_until
    ? new Date(previous.rows[0]?.cooldown_until)
    : null;
  let nextMode = scoreResult.riskLevel as "BLOCKED" | "NORMAL" | "ISOLATED" | "MONITORED";

  if (cooldownUntil && now < cooldownUntil) {
    const severityOrder = ["NORMAL", "MONITORED", "ISOLATED", "BLOCKED"] as const;
    if (severityOrder.indexOf(nextMode) < severityOrder.indexOf(lastMode)) {
      nextMode = lastMode;
    }
  }

  const modeChanged = nextMode !== lastMode;
  const cooldownHours = env.RISK_MODE_COOLDOWN_HOURS;
  const cooldown = new Date(now.getTime() + cooldownHours * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO seller_risk_metrics
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
       last_scored_at = NOW()`,
    [
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
    ]
  );

  await db.query(
    `UPDATE seller_balance
     SET seller_financial_mode = $2,
         risk_watch = $3,
         payout_hold = $4,
         risk_score = $5,
         last_score_at = NOW()
     WHERE seller_id = $1`,
    [sellerId, nextMode, scoreResult.riskWatch, scoreResult.payoutHold, scoreResult.score]
  );

  await logAudit({
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
    await logAudit({
      entityType: "seller_balance",
      entityId: sellerId,
      action: "SELLER_FINANCIAL_MODE_UPDATED",
      actorType: "system",
      metadata: { from: lastMode, to: nextMode }
    });
  }

  return { score: scoreResult.score, mode: nextMode, trend: scoreResult.trend, metrics };
};

export const scoreAllSellers = async () => {
  const sellers = await db.query(
    `SELECT DISTINCT s.owner_user_id AS seller_id
     FROM shops s`,
    []
  );

  let scored = 0;
  for (const seller of sellers.rows) {
    await calculateSellerRisk(seller.seller_id);
    const { evaluateSellerOperationalMode } = await import("./sellerSafetyController");
    await evaluateSellerOperationalMode(seller.seller_id);
    scored += 1;
  }
  return { scored };
};

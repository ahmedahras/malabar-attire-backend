import { db } from "../db/pool";
import { logAudit } from "../utils/audit";

type QualityInputs = {
  deliverySuccessRate: number;
  returnRatio: number;
  videoVerifiedReturnRatio: number;
  customerRepeatRate: number;
  ratingStability: number;
  orderVolumeConsistency: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const computeTier = (score: number) => {
  if (score >= 85) return "PLATINUM";
  if (score >= 70) return "GOLD";
  if (score >= 55) return "SILVER";
  return "BRONZE";
};

const computeEffects = (tier: string) => {
  switch (tier) {
    case "PLATINUM":
      return { rankingBoostMultiplier: 1.2, payoutSpeedDays: 2, reservePercent: 6, trustBadge: true };
    case "GOLD":
      return { rankingBoostMultiplier: 1.12, payoutSpeedDays: 3, reservePercent: 8, trustBadge: true };
    case "SILVER":
      return { rankingBoostMultiplier: 1.05, payoutSpeedDays: 5, reservePercent: 10, trustBadge: false };
    default:
      return { rankingBoostMultiplier: 1.0, payoutSpeedDays: 7, reservePercent: 12, trustBadge: false };
  }
};

const computeQualityScore = (inputs: QualityInputs) => {
  const score =
    clamp01(inputs.deliverySuccessRate) * 0.25 +
    (1 - clamp01(inputs.returnRatio)) * 0.2 +
    (1 - clamp01(inputs.videoVerifiedReturnRatio)) * 0.1 +
    clamp01(inputs.customerRepeatRate) * 0.15 +
    clamp01(inputs.ratingStability) * 0.2 +
    clamp01(inputs.orderVolumeConsistency) * 0.1;

  return clampScore(score * 100);
};

const getQualityInputs = async (sellerId: string): Promise<QualityInputs> => {
  const [ordersResult, deliveredResult, returnsResult, videoReturnsResult, repeatResult, ratingResult, volumeResult] =
    await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.created_at >= NOW() - '90 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS delivered
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND o.status IN ('DELIVERED', 'COMPLETED')
           AND o.created_at >= NOW() - '90 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS returns
         FROM return_requests rr
         INNER JOIN orders o ON o.id = rr.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND rr.requested_at >= NOW() - '90 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS video_returns
         FROM return_requests rr
         INNER JOIN orders o ON o.id = rr.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1
           AND rr.video_proof_url IS NOT NULL
           AND rr.requested_at >= NOW() - '90 days'::interval`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS repeat_customers
         FROM (
           SELECT o.user_id, COUNT(*) AS cnt
           FROM orders o
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND o.created_at >= NOW() - '180 days'::interval
           GROUP BY o.user_id
           HAVING COUNT(*) > 1
         ) t`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(STDDEV_POP(p.rating_avg), 0)::numeric AS rating_stddev
         FROM products p
         INNER JOIN shops s ON s.id = p.shop_id
         WHERE s.owner_user_id = $1
           AND p.rating_count > 0`,
        [sellerId]
      ),
      db.query(
        `WITH daily AS (
           SELECT DATE_TRUNC('day', o.created_at) AS day, COUNT(*)::int AS cnt
           FROM orders o
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND o.created_at >= NOW() - '30 days'::interval
           GROUP BY 1
         )
         SELECT COALESCE(STDDEV_POP(cnt), 0)::numeric AS stddev,
                COALESCE(AVG(cnt), 0)::numeric AS avg
         FROM daily`,
        [sellerId]
      )
    ]);

  const totalOrders = Number(ordersResult.rows[0]?.total ?? 0);
  const delivered = Number(deliveredResult.rows[0]?.delivered ?? 0);
  const returns = Number(returnsResult.rows[0]?.returns ?? 0);
  const videoReturns = Number(videoReturnsResult.rows[0]?.video_returns ?? 0);
  const repeatCustomers = Number(repeatResult.rows[0]?.repeat_customers ?? 0);

  const deliverySuccessRate = totalOrders === 0 ? 0 : delivered / totalOrders;
  const returnRatio = totalOrders === 0 ? 0 : returns / totalOrders;
  const videoVerifiedReturnRatio = returns === 0 ? 0 : videoReturns / returns;
  const customerRepeatRate = totalOrders === 0 ? 0 : repeatCustomers / totalOrders;

  const ratingStddev = Number(ratingResult.rows[0]?.rating_stddev ?? 0);
  const ratingStability = 1 - clamp01(ratingStddev / 1.5);

  const volumeStd = Number(volumeResult.rows[0]?.stddev ?? 0);
  const volumeAvg = Number(volumeResult.rows[0]?.avg ?? 0);
  const cv = volumeAvg === 0 ? 1 : volumeStd / volumeAvg;
  const orderVolumeConsistency = 1 - clamp01(cv);

  return {
    deliverySuccessRate,
    returnRatio,
    videoVerifiedReturnRatio,
    customerRepeatRate,
    ratingStability,
    orderVolumeConsistency
  };
};

export const calculateSellerQuality = async (sellerId: string) => {
  const inputs = await getQualityInputs(sellerId);
  const score = computeQualityScore(inputs);
  const tier = computeTier(score);
  const effects = computeEffects(tier);

  const breakdown = {
    inputs,
    weights: {
      deliverySuccessRate: 0.25,
      returnRatio: 0.2,
      videoVerifiedReturnRatio: 0.1,
      customerRepeatRate: 0.15,
      ratingStability: 0.2,
      orderVolumeConsistency: 0.1
    }
  };

  await db.query(
    `INSERT INTO seller_quality_metrics
     (seller_id, delivery_success_rate, return_ratio, video_verified_return_ratio,
      customer_repeat_rate, rating_stability, order_volume_consistency,
      seller_quality_score, seller_tier, ranking_boost_multiplier, payout_speed_days,
      reserve_percent, breakdown, last_scored_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (seller_id) DO UPDATE SET
       delivery_success_rate = EXCLUDED.delivery_success_rate,
       return_ratio = EXCLUDED.return_ratio,
       video_verified_return_ratio = EXCLUDED.video_verified_return_ratio,
       customer_repeat_rate = EXCLUDED.customer_repeat_rate,
       rating_stability = EXCLUDED.rating_stability,
       order_volume_consistency = EXCLUDED.order_volume_consistency,
       seller_quality_score = EXCLUDED.seller_quality_score,
       seller_tier = EXCLUDED.seller_tier,
       ranking_boost_multiplier = EXCLUDED.ranking_boost_multiplier,
       payout_speed_days = EXCLUDED.payout_speed_days,
       reserve_percent = EXCLUDED.reserve_percent,
       breakdown = EXCLUDED.breakdown,
       last_scored_at = NOW()`,
    [
      sellerId,
      inputs.deliverySuccessRate,
      inputs.returnRatio,
      inputs.videoVerifiedReturnRatio,
      inputs.customerRepeatRate,
      inputs.ratingStability,
      inputs.orderVolumeConsistency,
      score,
      tier,
      effects.rankingBoostMultiplier,
      effects.payoutSpeedDays,
      effects.reservePercent,
      JSON.stringify(breakdown)
    ]
  );

  await db.query(
    `INSERT INTO seller_quality_history (seller_id, seller_quality_score, seller_tier, breakdown)
     VALUES ($1, $2, $3, $4)`,
    [sellerId, score, tier, JSON.stringify(breakdown)]
  );

  await db.query(
    `UPDATE shops
     SET seller_quality_score = $2,
         seller_tier = $3,
         trust_badge = $4
     WHERE owner_user_id = $1`,
    [sellerId, score, tier, effects.trustBadge]
  );

  await logAudit({
    entityType: "seller_quality",
    entityId: sellerId,
    action: "SELLER_QUALITY_SCORE_UPDATED",
    actorType: "system",
    metadata: { score, tier, effects }
  });

  return { score, tier, effects, breakdown };
};

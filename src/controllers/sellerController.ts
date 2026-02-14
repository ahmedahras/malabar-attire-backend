import { Request, Response } from "express";
import { db } from "../db/pool";
import { calculateSellerQuality } from "../services/sellerQualityService";
import { keysToCamel } from "../utils/case";

export const getSellerQuality = async (req: Request, res: Response) => {
  const sellerId = String(req.params.id);
  const recalc = req.query.recalculate === "true";

  if (recalc) {
    const result = await calculateSellerQuality(sellerId);
    return res.json({ quality: result });
  }

  const { rows } = await db.query(
    `SELECT seller_id, delivery_success_rate, return_ratio, video_verified_return_ratio,
            customer_repeat_rate, rating_stability, order_volume_consistency,
            seller_quality_score, seller_tier, ranking_boost_multiplier, payout_speed_days,
            reserve_percent, breakdown, last_scored_at
     FROM seller_quality_metrics
     WHERE seller_id = $1`,
    [sellerId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Quality score not found" });
  }

  return res.json({ quality: keysToCamel(rows[0]) });
};

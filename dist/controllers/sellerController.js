"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerQuality = void 0;
const pool_1 = require("../db/pool");
const sellerQualityService_1 = require("../services/sellerQualityService");
const case_1 = require("../utils/case");
const getSellerQuality = async (req, res) => {
    const sellerId = String(req.params.id);
    const recalc = req.query.recalculate === "true";
    if (recalc) {
        const result = await (0, sellerQualityService_1.calculateSellerQuality)(sellerId);
        return res.json({ quality: result });
    }
    const { rows } = await pool_1.db.query(`SELECT seller_id, delivery_success_rate, return_ratio, video_verified_return_ratio,
            customer_repeat_rate, rating_stability, order_volume_consistency,
            seller_quality_score, seller_tier, ranking_boost_multiplier, payout_speed_days,
            reserve_percent, breakdown, last_scored_at
     FROM seller_quality_metrics
     WHERE seller_id = $1`, [sellerId]);
    if (!rows[0]) {
        return res.status(404).json({ error: "Quality score not found" });
    }
    return res.json({ quality: (0, case_1.keysToCamel)(rows[0]) });
};
exports.getSellerQuality = getSellerQuality;
//# sourceMappingURL=sellerController.js.map
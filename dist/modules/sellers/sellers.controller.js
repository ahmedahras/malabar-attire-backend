"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerQuality = exports.updateMyPickupAddress = exports.getMyShop = exports.createShop = void 0;
const zod_1 = require("zod");
const case_1 = require("../../utils/case");
const pool_1 = require("../../db/pool");
const sellerQualityService_1 = require("../../services/sellerQualityService");
const shippingService_1 = require("../../services/shippingService");
const sellers_service_1 = require("./sellers.service");
const createShopSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(150),
    district: zod_1.z.string().min(2).max(100)
});
const pickupAddressSchema = zod_1.z.object({
    pickupName: zod_1.z.string().trim().min(2).max(100),
    contactName: zod_1.z.string().trim().min(2).max(100),
    email: zod_1.z.string().trim().email(),
    phone: zod_1.z.string().trim().min(8).max(20),
    addressLine1: zod_1.z.string().trim().min(3).max(200),
    addressLine2: zod_1.z.string().trim().max(200).optional(),
    city: zod_1.z.string().trim().min(2).max(100),
    state: zod_1.z.string().trim().min(2).max(100),
    country: zod_1.z.string().trim().min(2).max(100).default("India"),
    pincode: zod_1.z.string().trim().min(4).max(12)
});
const createShop = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = createShopSchema.parse(req.body);
    const result = await (0, sellers_service_1.createShopForOwner)({
        ownerUserId: req.user.sub,
        name: body.name,
        district: body.district
    });
    if (result.alreadyExists) {
        return res.status(400).json({ error: "Shop already exists" });
    }
    return res.status(201).json({
        shop: (0, case_1.keysToCamel)(result.shop)
    });
};
exports.createShop = createShop;
const getMyShop = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shop = await (0, sellers_service_1.getShopByOwner)(req.user.sub);
    if (!shop) {
        return res.status(404).json({ error: "Shop not found" });
    }
    return res.json({ shop: (0, case_1.keysToCamel)(shop) });
};
exports.getMyShop = getMyShop;
const updateMyPickupAddress = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = pickupAddressSchema.parse(req.body ?? {});
    const existingShop = await (0, sellers_service_1.getShopByOwner)(req.user.sub);
    if (!existingShop) {
        return res.status(404).json({ error: "Shop not found" });
    }
    try {
        await (0, shippingService_1.registerOrUpdatePickupLocation)({
            pickupName: body.pickupName,
            contactName: body.contactName,
            email: body.email,
            phone: body.phone,
            addressLine1: body.addressLine1,
            addressLine2: body.addressLine2,
            city: body.city,
            state: body.state,
            country: body.country,
            pincode: body.pincode
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Shiprocket pickup sync failed";
        return res.status(502).json({ error: message });
    }
    const shop = await (0, sellers_service_1.updateShopPickupAddress)({
        ownerUserId: req.user.sub,
        pickupName: body.pickupName,
        pickupAddress: body
    });
    if (!shop) {
        return res.status(404).json({ error: "Shop not found" });
    }
    return res.json({ shop: (0, case_1.keysToCamel)(shop) });
};
exports.updateMyPickupAddress = updateMyPickupAddress;
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
//# sourceMappingURL=sellers.controller.js.map
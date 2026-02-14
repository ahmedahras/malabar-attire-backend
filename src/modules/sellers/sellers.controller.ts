import { Request, Response } from "express";
import { z } from "zod";
import { keysToCamel } from "../../utils/case";
import { db } from "../../db/pool";
import { calculateSellerQuality } from "../../services/sellerQualityService";
import { registerOrUpdatePickupLocation } from "../../services/shippingService";
import { createShopForOwner, getShopByOwner, updateShopPickupAddress } from "./sellers.service";

const createShopSchema = z.object({
  name: z.string().min(2).max(150),
  district: z.string().min(2).max(100)
});

const pickupAddressSchema = z.object({
  pickupName: z.string().trim().min(2).max(100),
  contactName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100).default("India"),
  pincode: z.string().trim().min(4).max(12)
});

export const createShop = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const body = createShopSchema.parse(req.body);
  const result = await createShopForOwner({
    ownerUserId: req.user.sub,
    name: body.name,
    district: body.district
  });

  if (result.alreadyExists) {
    return res.status(400).json({ error: "Shop already exists" });
  }

  return res.status(201).json({
    shop: keysToCamel(result.shop)
  });
};

export const getMyShop = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const shop = await getShopByOwner(req.user.sub);
  if (!shop) {
    return res.status(404).json({ error: "Shop not found" });
  }

  return res.json({ shop: keysToCamel(shop) });
};

export const updateMyPickupAddress = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const body = pickupAddressSchema.parse(req.body ?? {});
  const existingShop = await getShopByOwner(req.user.sub);
  if (!existingShop) {
    return res.status(404).json({ error: "Shop not found" });
  }

  try {
    await registerOrUpdatePickupLocation({
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shiprocket pickup sync failed";
    return res.status(502).json({ error: message });
  }

  const shop = await updateShopPickupAddress({
    ownerUserId: req.user.sub,
    pickupName: body.pickupName,
    pickupAddress: body
  });

  if (!shop) {
    return res.status(404).json({ error: "Shop not found" });
  }

  return res.json({ shop: keysToCamel(shop) });
};

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

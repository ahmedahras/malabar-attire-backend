import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { createShop, getMyShop, getSellerQuality, updateMyPickupAddress } from "./sellers.controller";
import { rateLimitProtected } from "../../middleware/rateLimiter";
import { sellerEarningsRouter } from "./sellerEarnings.routes";

export const sellersRouter = Router();

sellersRouter.post("/", requireAuth, rateLimitProtected, requireRole("shop_owner"), createShop);
sellersRouter.use("/me", sellerEarningsRouter);
sellersRouter.get("/me", requireAuth, rateLimitProtected, requireRole("shop_owner"), getMyShop);
sellersRouter.put(
  "/me/pickup-address",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  updateMyPickupAddress
);
sellersRouter.get(
  "/:id/quality",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getSellerQuality
);

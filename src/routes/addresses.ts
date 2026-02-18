import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} from "../controllers/addressesController";

export const addressesRouter = Router();

// Customer checkout flows are also available to shop owners.
addressesRouter.get("/", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), listAddresses);
addressesRouter.post("/", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), createAddress);
addressesRouter.put("/:id", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), updateAddress);
addressesRouter.delete("/:id", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), deleteAddress);
addressesRouter.patch("/:id/default", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), setDefaultAddress);

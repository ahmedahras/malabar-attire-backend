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

// All routes require a logged-in customer
addressesRouter.get("/", requireAuth, rateLimitProtected, requireRole("customer"), listAddresses);
addressesRouter.post("/", requireAuth, rateLimitProtected, requireRole("customer"), createAddress);
addressesRouter.put("/:id", requireAuth, rateLimitProtected, requireRole("customer"), updateAddress);
addressesRouter.delete("/:id", requireAuth, rateLimitProtected, requireRole("customer"), deleteAddress);
addressesRouter.patch("/:id/default", requireAuth, rateLimitProtected, requireRole("customer"), setDefaultAddress);

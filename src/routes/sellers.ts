import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { getSellerQuality } from "../controllers/sellerController";

export const sellersRouter = Router();

sellersRouter.get(
  "/:id/quality",
  requireAuth,
  requireRole("admin"),
  getSellerQuality
);

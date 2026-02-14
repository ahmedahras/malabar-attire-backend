import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import {
  createPayoutBatch,
  getPayoutBatchById,
  getPayoutBatchStats,
  listPayoutBatches,
  patchPayoutBatchStatus
} from "../controllers/adminPayout.controller";

export const adminPayoutsRouter = Router();

adminPayoutsRouter.get(
  "/payouts/stats",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getPayoutBatchStats
);

adminPayoutsRouter.get(
  "/payouts",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  listPayoutBatches
);

adminPayoutsRouter.post(
  "/payouts",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  createPayoutBatch
);

adminPayoutsRouter.get(
  "/payouts/:payoutId",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getPayoutBatchById
);

adminPayoutsRouter.patch(
  "/payouts/:payoutId/status",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  patchPayoutBatchStatus
);

import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { rateLimitProtected } from "../../middleware/rateLimiter";
import {
  getMyEarningsSummary,
  getMyLedgerHistory,
  getMyPayoutHistory
} from "./earnings.controller";

export const sellerEarningsRouter = Router();

sellerEarningsRouter.get(
  "/earnings",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getMyEarningsSummary
);
sellerEarningsRouter.get(
  "/earnings/ledger",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getMyLedgerHistory
);
sellerEarningsRouter.get(
  "/payouts",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getMyPayoutHistory
);


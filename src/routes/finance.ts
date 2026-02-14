import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import {
  financeSummary,
  payoutHistory,
  sellerFinanceBreakdown,
  systemState,
  riskySellers,
  sellerRiskStatus,
  financeSystemHealth,
  revalidateSellerRiskNow,
  auditEvents,
  sellerRiskScore,
  sellerIsolationStatus
} from "../controllers/financeController";

export const financeRouter = Router();

financeRouter.get("/summary", requireAuth, rateLimitProtected, requireRole("admin"), financeSummary);
financeRouter.get(
  "/system-state",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  systemState
);
financeRouter.get(
  "/system-health",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  financeSystemHealth
);
financeRouter.get("/risk/sellers", requireAuth, rateLimitProtected, requireRole("admin"), riskySellers);
financeRouter.get(
  "/risk/seller/:id/status",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  sellerRiskStatus
);

financeRouter.get(
  "/risk/score/:sellerId",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  sellerRiskScore
);

financeRouter.get(
  "/isolation/status/:sellerId",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  sellerIsolationStatus
);

financeRouter.post(
  "/risk/seller/:id/revalidate-now",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  revalidateSellerRiskNow
);

financeRouter.get(
  "/audit/events",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  auditEvents
);

financeRouter.get(
  "/sellers/:sellerId",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  sellerFinanceBreakdown
);

financeRouter.get(
  "/sellers/:sellerId/payouts",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  payoutHistory
);

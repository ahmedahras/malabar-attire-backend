import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import { adminReturnsRouter } from "./adminReturns";
import { adminPayoutsRouter } from "./adminPayouts";
import { adminPlatformRevenueRouter } from "./adminPlatformRevenue";
import { getOrderDetailForAdmin, listOrdersForAdmin } from "../controllers/adminOrdersController";
import {
  getAnalyticsOverview,
  getAnalyticsOrders,
  getAnalyticsRefunds,
  getAnalyticsQualityRisk,
  getAnalyticsNotifications
} from "../controllers/adminAnalyticsController";
import {
  toggleFinanceFreeze,
  toggleJobsEnabled,
  updateSellerFinancialMode,
  blockProduct,
  unblockProduct,
  getCacheStats,
  getQueueMetrics
} from "../controllers/adminControlController";

export const adminRouter = Router();

adminRouter.use(adminReturnsRouter);
adminRouter.use(adminPayoutsRouter);
adminRouter.use(adminPlatformRevenueRouter);

console.log("ROUTE_HANDLER_BOUND:", getAnalyticsOverview.toString().slice(0, 120));

adminRouter.get(
  "/orders/:orderId",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getOrderDetailForAdmin
);

adminRouter.get(
  "/orders",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  listOrdersForAdmin
);

adminRouter.get(
  "/analytics/overview",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAnalyticsOverview
);
adminRouter.get(
  "/analytics/orders",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAnalyticsOrders
);
adminRouter.get(
  "/analytics/refunds",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAnalyticsRefunds
);
adminRouter.get(
  "/analytics/quality-risk",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAnalyticsQualityRisk
);
adminRouter.get(
  "/analytics/notifications",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAnalyticsNotifications
);

adminRouter.post(
  "/system/finance-freeze",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  toggleFinanceFreeze
);
adminRouter.post(
  "/system/jobs-enabled",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  toggleJobsEnabled
);
adminRouter.post(
  "/sellers/:id/mode",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  updateSellerFinancialMode
);
adminRouter.post(
  "/products/:id/block",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  blockProduct
);
adminRouter.post(
  "/products/:id/unblock",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  unblockProduct
);

adminRouter.get(
  "/system/cache-stats",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getCacheStats
);

adminRouter.get(
  "/metrics/queues",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getQueueMetrics
);

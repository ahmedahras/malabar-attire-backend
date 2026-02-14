import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { rateLimitProtected } from "../../middleware/rateLimiter";
import {
  getLowStockHandler,
  getRefundsHandler,
  getSalesTrendHandler,
  getSummary,
  getTopProductsHandler
} from "./sellerDashboard.controller";

export const sellerDashboardRouter = Router();

sellerDashboardRouter.get(
  "/summary",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getSummary
);
sellerDashboardRouter.get(
  "/sales-trend",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getSalesTrendHandler
);
sellerDashboardRouter.get(
  "/top-products",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getTopProductsHandler
);
sellerDashboardRouter.get(
  "/low-stock",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getLowStockHandler
);
sellerDashboardRouter.get(
  "/refunds",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  getRefundsHandler
);

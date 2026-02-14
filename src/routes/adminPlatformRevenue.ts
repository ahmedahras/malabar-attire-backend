import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import {
  getAdminPlatformRevenue,
  getAdminPlatformRevenueBySeller
} from "../controllers/adminPlatformRevenue.controller";
import {
  exportAdminPlatformRevenueCsv,
  getAdminPlatformRevenueGstReport
} from "../controllers/adminPlatformRevenueExport.controller";

export const adminPlatformRevenueRouter = Router();

adminPlatformRevenueRouter.get(
  "/platform/revenue",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAdminPlatformRevenue
);

adminPlatformRevenueRouter.get(
  "/platform/revenue/by-seller",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAdminPlatformRevenueBySeller
);

adminPlatformRevenueRouter.get(
  "/platform/revenue/export",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  exportAdminPlatformRevenueCsv
);

adminPlatformRevenueRouter.get(
  "/platform/revenue/gst",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  getAdminPlatformRevenueGstReport
);

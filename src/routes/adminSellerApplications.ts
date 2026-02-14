import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import {
  approveSellerApplication,
  listSellerApplicationsAdmin,
  rejectSellerApplication
} from "../controllers/sellerApplicationsController";

export const adminSellerApplicationsRouter = Router();

adminSellerApplicationsRouter.get(
  "/",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  listSellerApplicationsAdmin
);

adminSellerApplicationsRouter.patch(
  "/:id/approve",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  approveSellerApplication
);

adminSellerApplicationsRouter.patch(
  "/:id/reject",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  rejectSellerApplication
);


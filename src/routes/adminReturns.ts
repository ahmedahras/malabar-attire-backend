import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { adminReviewReturn } from "../controllers/adminReturnsController";
import { requireReturnAccess } from "../middleware/authorization";
import { rateLimitProtected } from "../middleware/rateLimiter";

export const adminReturnsRouter = Router();

adminReturnsRouter.post(
  "/returns/:id/review",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  requireReturnAccess(),
  adminReviewReturn
);

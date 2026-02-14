import { Router } from "express";
import { createUploadPresign } from "../controllers/uploadsController";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";

export const uploadsRouter = Router();

uploadsRouter.post(
  "/presign",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  createUploadPresign
);

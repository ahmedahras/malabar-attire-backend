import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import { applySeller } from "../controllers/sellerApplicationsController";

export const sellerApplicationsRouter = Router();

sellerApplicationsRouter.post(
  "/apply",
  requireAuth,
  rateLimitProtected,
  applySeller
);


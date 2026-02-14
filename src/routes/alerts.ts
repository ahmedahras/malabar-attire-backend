import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listAlerts, resolveAlert } from "../controllers/alertsController";
import { rateLimitProtected } from "../middleware/rateLimiter";

export const alertsRouter = Router();

alertsRouter.get("/", requireAuth, rateLimitProtected, requireRole("admin"), listAlerts);
alertsRouter.patch(
  "/:id/resolve",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  resolveAlert
);

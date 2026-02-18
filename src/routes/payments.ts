import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireOrderAccess } from "../middleware/authorization";
import { createPaymentIntent } from "../controllers/paymentsController";
import { rateLimitProtected } from "../middleware/rateLimiter";

export const paymentsRouter = Router();

paymentsRouter.post(
  "/intent",
  requireAuth,
  rateLimitProtected,
  requireRole("customer", "shop_owner"),
  requireOrderAccess("orderId"),
  createPaymentIntent
);

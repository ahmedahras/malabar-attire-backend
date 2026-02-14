import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitOrdersRefunds, rateLimitProtected } from "../middleware/rateLimiter";
import {
  createReturnRequest,
  disputeReturn,
  markReturnReceived,
  refundReturn,
  sellerReviewReturn
} from "../controllers/returnsController";
import { requireDeliveredOrderForReturn } from "../middleware/returns";
import { requireReturnAccess, requireRefundPermission } from "../middleware/authorization";

export const returnsRouter = Router();

returnsRouter.post(
  "/",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("customer"),
  requireDeliveredOrderForReturn,
  createReturnRequest
);

returnsRouter.post(
  "/:id/seller-review",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("shop_owner"),
  requireReturnAccess(),
  sellerReviewReturn
);

returnsRouter.post(
  "/:id/mark-received",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("shop_owner"),
  requireReturnAccess(),
  markReturnReceived
);

returnsRouter.post(
  "/:id/refund",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("admin"),
  requireRefundPermission(),
  requireReturnAccess(),
  refundReturn
);

returnsRouter.post(
  "/:id/dispute",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("customer"),
  requireReturnAccess(),
  disputeReturn
);

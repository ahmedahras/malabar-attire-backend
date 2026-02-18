import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireOrderAccess } from "../middleware/authorization";
import { rateLimitOrdersRefunds, rateLimitProtected } from "../middleware/rateLimiter";
import {
  confirmOrderPaid,
  createOrderFromCart,
  getOrderById,
  shipOrder,
  shipOrderViaShiprocket,
  getOrderTracking,
  getOrderTimeline,
  listOrdersForCustomer,
  listOrdersForSeller,
  updateOrderStatus
} from "../controllers/ordersController";

export const ordersRouter = Router();

ordersRouter.post("/", requireAuth, rateLimitOrdersRefunds, requireRole("customer", "shop_owner"), createOrderFromCart);
ordersRouter.get("/", requireAuth, rateLimitProtected, requireRole("customer", "shop_owner"), listOrdersForCustomer);
ordersRouter.get(
  "/seller/orders",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  listOrdersForSeller
);
ordersRouter.get("/:id", requireAuth, rateLimitProtected, requireOrderAccess(), getOrderById);
ordersRouter.get(
  "/:id/timeline",
  requireAuth,
  rateLimitProtected,
  requireOrderAccess(),
  getOrderTimeline
);
ordersRouter.get(
  "/:id/tracking",
  requireAuth,
  rateLimitProtected,
  requireOrderAccess(),
  getOrderTracking
);
ordersRouter.post(
  "/:id/ship",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("shop_owner"),
  requireOrderAccess(),
  shipOrder
);
ordersRouter.post(
  "/:id/shiprocket",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("shop_owner", "admin"),
  requireOrderAccess(),
  shipOrderViaShiprocket
);
ordersRouter.patch(
  "/:id/status",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("shop_owner", "admin"),
  requireOrderAccess(),
  updateOrderStatus
);

ordersRouter.patch(
  "/:id/paid",
  requireAuth,
  rateLimitOrdersRefunds,
  requireRole("admin"),
  requireOrderAccess(),
  confirmOrderPaid
);

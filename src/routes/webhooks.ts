import { Router } from "express";
import { handleRazorpayWebhook } from "../controllers/webhooksController";
import {
  handleShipmentWebhook,
  handleShiprocketWebhookSync
} from "../controllers/shiprocketWebhook.controller";
import { rateLimitWebhooks } from "../middleware/rateLimiter";
import { requireShiprocketWebhookKey } from "../middleware/webhookAuth";

export const webhooksRouter = Router();

webhooksRouter.post("/razorpay", rateLimitWebhooks, handleRazorpayWebhook);
webhooksRouter.post(
  "/shiprocket",
  rateLimitWebhooks,
  requireShiprocketWebhookKey,
  handleShiprocketWebhookSync
);
webhooksRouter.post(
  "/shipment",
  rateLimitWebhooks,
  requireShiprocketWebhookKey,
  handleShipmentWebhook
);

import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { updateShipmentStatusByAwb } from "../services/shiprocketWebhook.service";
import { normalizeShiprocketStatus } from "../utils/shiprocketStatus";
import { logger } from "../utils/logger";

const webhookPayloadSchema = z
  .object({
    awb: z.string().optional(),
    awb_code: z.string().optional(),
    current_status: z.string().optional(),
    shipment_status: z.string().optional(),
    status: z.string().optional(),
    data: z
      .object({
        awb: z.string().optional(),
        awb_code: z.string().optional(),
        current_status: z.string().optional(),
        shipment_status: z.string().optional(),
        status: z.string().optional()
      })
      .optional(),
    shipment: z
      .object({
        awb: z.string().optional(),
        awb_code: z.string().optional(),
        current_status: z.string().optional(),
        shipment_status: z.string().optional(),
        status: z.string().optional()
      })
      .optional()
  })
  .passthrough();

const extractAuthSecret = (req: Request) => {
  const direct =
    req.headers["x-shiprocket-secret"] ?? req.headers["x-webhook-secret"] ?? req.headers["x-api-secret"];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
};

export const handleShiprocketWebhookSync = async (req: Request, res: Response) => {
  const configuredSecret = env.SHIPROCKET_WEBHOOK_SECRET?.trim();
  const providedSecret = extractAuthSecret(req);

  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = webhookPayloadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const body = parsed.data;
  const awb =
    body.awb?.trim() ||
    body.awb_code?.trim() ||
    body.data?.awb?.trim() ||
    body.data?.awb_code?.trim() ||
    body.shipment?.awb?.trim() ||
    body.shipment?.awb_code?.trim() ||
    "";
  const currentStatus =
    body.current_status?.trim() ||
    body.shipment_status?.trim() ||
    body.status?.trim() ||
    body.data?.current_status?.trim() ||
    body.data?.shipment_status?.trim() ||
    body.data?.status?.trim() ||
    body.shipment?.current_status?.trim() ||
    body.shipment?.shipment_status?.trim() ||
    body.shipment?.status?.trim() ||
    "";

  if (!awb || !currentStatus) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const normalized = normalizeShiprocketStatus(currentStatus);
    const result = await updateShipmentStatusByAwb({
      awbCode: awb,
      normalizedStatus: normalized,
      rawStatus: currentStatus
    });

    if (result.status === "not_found") {
      return res.status(200).json({ status: "ignored" });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error, awb, currentStatus }, "Shiprocket webhook sync failed");
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};

export const handleShipmentWebhook = async (req: Request, res: Response) => {
  const configuredSecret = env.SHIPROCKET_WEBHOOK_SECRET?.trim();
  const providedToken = req.headers["x-api-key"];
  const token = typeof providedToken === "string" ? providedToken.trim() : "";

  if (!configuredSecret || !token || token !== configuredSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  logger.info({ provider: "shiprocket", payload: req.body ?? null }, "Shipment webhook received");
  return res.status(200).json({ status: "ok" });
};

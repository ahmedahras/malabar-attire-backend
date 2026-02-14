"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleShiprocketWebhookSync = void 0;
const zod_1 = require("zod");
const env_1 = require("../config/env");
const shiprocketWebhook_service_1 = require("../services/shiprocketWebhook.service");
const shiprocketStatus_1 = require("../utils/shiprocketStatus");
const logger_1 = require("../utils/logger");
const webhookPayloadSchema = zod_1.z
    .object({
    awb: zod_1.z.string().optional(),
    awb_code: zod_1.z.string().optional(),
    current_status: zod_1.z.string().optional(),
    shipment_status: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    data: zod_1.z
        .object({
        awb: zod_1.z.string().optional(),
        awb_code: zod_1.z.string().optional(),
        current_status: zod_1.z.string().optional(),
        shipment_status: zod_1.z.string().optional(),
        status: zod_1.z.string().optional()
    })
        .optional(),
    shipment: zod_1.z
        .object({
        awb: zod_1.z.string().optional(),
        awb_code: zod_1.z.string().optional(),
        current_status: zod_1.z.string().optional(),
        shipment_status: zod_1.z.string().optional(),
        status: zod_1.z.string().optional()
    })
        .optional()
})
    .passthrough();
const extractAuthSecret = (req) => {
    const direct = req.headers["x-shiprocket-secret"] ?? req.headers["x-webhook-secret"] ?? req.headers["x-api-secret"];
    if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
    }
    const auth = req.headers.authorization;
    if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
        return auth.slice(7).trim();
    }
    return null;
};
const handleShiprocketWebhookSync = async (req, res) => {
    const configuredSecret = env_1.env.SHIPROCKET_WEBHOOK_SECRET?.trim();
    const providedSecret = extractAuthSecret(req);
    if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const parsed = webhookPayloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
    }
    const body = parsed.data;
    const awb = body.awb?.trim() ||
        body.awb_code?.trim() ||
        body.data?.awb?.trim() ||
        body.data?.awb_code?.trim() ||
        body.shipment?.awb?.trim() ||
        body.shipment?.awb_code?.trim() ||
        "";
    const currentStatus = body.current_status?.trim() ||
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
        const normalized = (0, shiprocketStatus_1.normalizeShiprocketStatus)(currentStatus);
        const result = await (0, shiprocketWebhook_service_1.updateShipmentStatusByAwb)({
            awbCode: awb,
            normalizedStatus: normalized,
            rawStatus: currentStatus
        });
        if (result.status === "not_found") {
            return res.status(200).json({ status: "ignored" });
        }
        return res.status(200).json({ status: "ok" });
    }
    catch (error) {
        logger_1.logger.error({ err: error, awb, currentStatus }, "Shiprocket webhook sync failed");
        return res.status(500).json({ error: "Webhook processing failed" });
    }
};
exports.handleShiprocketWebhookSync = handleShiprocketWebhookSync;
//# sourceMappingURL=shiprocketWebhook.controller.js.map
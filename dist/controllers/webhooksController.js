"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleShiprocketWebhook = exports.handleRazorpayWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const pool_1 = require("../db/pool");
const logger_1 = require("../utils/logger");
const ordersService_1 = require("../services/ordersService");
const env_1 = require("../config/env");
const audit_1 = require("../utils/audit");
const enqueue_1 = require("../jobs/enqueue");
const cache_1 = require("../utils/cache");
const ordersService_2 = require("../services/ordersService");
const metrics_1 = require("../utils/metrics");
const handleRazorpayWebhook = async (req, res) => {
    const signatureHeader = req.headers["x-razorpay-signature"];
    if (!env_1.env.RAZORPAY_WEBHOOK_SECRET || !signatureHeader || Array.isArray(signatureHeader)) {
        logger_1.logger.warn({ provider: "razorpay", errorCode: "SIGNATURE_MISSING" }, "Missing webhook signature or secret");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(401).json({ error: "Unauthorized" });
    }
    const rawBuffer = req.rawBody ??
        (Buffer.isBuffer(req.body) ? req.body : undefined);
    const rawBody = rawBuffer ? rawBuffer.toString("utf8") : "";
    const expected = crypto_1.default
        .createHmac("sha256", env_1.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    const signature = String(signatureHeader).trim();
    const timestampHeader = req.headers["x-razorpay-timestamp"];
    if (timestampHeader && isTimestampTooOld(timestampHeader)) {
        logger_1.logger.warn({ provider: "razorpay", errorCode: "TIMESTAMP_EXPIRED" }, "Webhook timestamp expired");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(401).json({ error: "Unauthorized" });
    }
    const isValidSignature = signature.length === expected.length &&
        crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!isValidSignature) {
        logger_1.logger.warn({ provider: "razorpay", errorCode: "SIGNATURE_INVALID" }, "Invalid Razorpay webhook signature");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        await (0, audit_1.logAudit)({
            entityType: "payment",
            entityId: "00000000-0000-0000-0000-000000000000",
            action: "signature_invalid",
            actorType: "system",
            metadata: { provider: "razorpay" }
        });
        return res.status(401).json({ error: "Unauthorized" });
    }
    let body;
    try {
        body = JSON.parse(rawBody);
    }
    catch (error) {
        logger_1.logger.warn({ provider: "razorpay", errorCode: "INVALID_PAYLOAD" }, "Invalid webhook payload");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(400).json({ error: "Invalid payload" });
    }
    const event = body?.event;
    const payload = body?.payload?.payment?.entity;
    const refund = body?.payload?.refund?.entity;
    const providerEventId = body?.id || payload?.id;
    const eventId = providerEventId ?? crypto_1.default.createHash("sha256").update(rawBody).digest("hex");
    const client = await pool_1.db.connect();
    let refundEmailPayload = null;
    try {
        await client.query("BEGIN");
        const alreadyProcessed = await client.query(`SELECT 1
       FROM webhook_events_processed
       WHERE provider = $1
         AND event_id = $2
       LIMIT 1`, ["razorpay", eventId]);
        if (alreadyProcessed.rows[0]) {
            await client.query("ROLLBACK");
            logger_1.logger.warn({ provider: "razorpay", eventId, errorCode: "REPLAY_DETECTED" }, "Webhook replay ignored");
            (0, metrics_1.incrementMetric)("webhook_failures_total");
            return res.json({ status: "ignored" });
        }
        await client.query(`INSERT INTO webhook_events (provider, provider_event_id, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`, ["razorpay", providerEventId ?? eventId, JSON.stringify(body)]);
        if (refund && (refund.status === "processed" || refund.status === "completed")) {
            const gatewayRef = refund.id ?? refund.payment_id ?? refund.order_id ?? null;
            const providerPaymentId = refund.payment_id ?? null;
            const providerOrderId = refund.order_id ?? null;
            await client.query(`UPDATE order_refunds r
         SET status = 'COMPLETED',
             gateway_reference = COALESCE($1, r.gateway_reference),
             completed_at = NOW(),
             updated_at = NOW()
         FROM payment_intents pi
         WHERE r.order_id = pi.order_id
           AND (pi.provider_payment_id = $2 OR pi.provider_order_id = $3)`, [gatewayRef, providerPaymentId, providerOrderId]);
            const emailRows = await client.query(`SELECT r.order_id, r.amount, u.email
         FROM order_refunds r
         INNER JOIN orders o ON o.id = r.order_id
         INNER JOIN users u ON u.id = o.user_id
         INNER JOIN payment_intents pi ON pi.order_id = r.order_id
         WHERE r.status = 'COMPLETED'
           AND (pi.provider_payment_id = $1 OR pi.provider_order_id = $2)
         ORDER BY r.updated_at DESC
         LIMIT 1`, [providerPaymentId, providerOrderId]);
            if (emailRows.rows[0]?.email) {
                refundEmailPayload = {
                    to: emailRows.rows[0].email,
                    orderId: emailRows.rows[0].order_id,
                    amount: Number(emailRows.rows[0].amount ?? 0)
                };
            }
        }
        else if (event === "payment.failed") {
            const failedPayment = body?.payload?.payment?.entity;
            const paymentId = failedPayment?.id ?? null;
            const providerOrderId = failedPayment?.order_id ?? null;
            const reason = failedPayment?.error_description ?? failedPayment?.error_reason ?? "payment_failed";
            if (paymentId || providerOrderId) {
                await client.query(`UPDATE payment_intents
           SET status = 'failed',
               provider_payment_id = COALESCE($1, provider_payment_id),
               provider_order_id = COALESCE($2, provider_order_id),
               metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{failure_reason}', to_jsonb($3::text)),
               updated_at = NOW()
           WHERE provider_payment_id = $1 OR provider_order_id = $2`, [paymentId, providerOrderId, String(reason)]);
            }
        }
        else if (event === "payment.captured") {
            const paymentId = payload?.id;
            const providerOrderId = payload?.order_id;
            const amountCaptured = payload?.amount;
            if (!paymentId && !providerOrderId) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Missing payment identifiers" });
            }
            const intentResult = await client.query(`UPDATE payment_intents
         SET status = 'captured',
             provider_payment_id = COALESCE($1, provider_payment_id),
             provider_order_id = COALESCE($2, provider_order_id),
             updated_at = NOW()
         WHERE provider_payment_id = $1 OR provider_order_id = $2
         RETURNING order_id`, [paymentId ?? null, providerOrderId ?? null]);
            const orderId = intentResult.rows[0]?.order_id;
            if (orderId) {
                const orderAmountResult = await client.query(`SELECT o.total_amount
           FROM orders o
           WHERE o.id = $1`, [orderId]);
                const orderTotal = Number(orderAmountResult.rows[0]?.total_amount ?? 0);
                const expectedPaise = Math.round(orderTotal * 100);
                if (amountCaptured && amountCaptured !== expectedPaise) {
                    logger_1.logger.warn({ orderId, amountCaptured, expectedPaise }, "Payment amount mismatch");
                    await client.query(`UPDATE payment_intents
             SET metadata = jsonb_set(metadata, '{amount_mismatch}', 'true'::jsonb)
             WHERE order_id = $1`, [orderId]);
                    await (0, audit_1.logAudit)({
                        entityType: "payment",
                        entityId: orderId,
                        action: "amount_mismatch",
                        actorType: "system",
                        metadata: { amountCaptured, expectedPaise }
                    });
                    await client.query(`INSERT INTO webhook_events_processed (provider, event_id)
             VALUES ($1, $2)`, ["razorpay", eventId]);
                    await client.query("COMMIT");
                    return res.status(202).json({ status: "mismatch" });
                }
                try {
                    await (0, ordersService_1.markOrderPaid)(orderId, "system", null, "webhook");
                }
                catch (error) {
                    await client.query("ROLLBACK");
                    logger_1.logger.error({ err: error, orderId }, "Failed to mark order as paid");
                    return res.status(500).json({ error: "Failed to process payment" });
                }
            }
            else {
                logger_1.logger.warn({ paymentId, providerOrderId }, "Payment intent not found");
            }
        }
        await client.query(`INSERT INTO webhook_events_processed (provider, event_id)
       VALUES ($1, $2)`, ["razorpay", eventId]);
        await client.query("COMMIT");
        if (refundEmailPayload) {
            try {
                await (0, enqueue_1.enqueueEmail)({
                    to: refundEmailPayload.to,
                    template: "refund_approved",
                    data: { orderId: refundEmailPayload.orderId, amount: refundEmailPayload.amount }
                });
            }
            catch (e) {
                logger_1.logger.warn({ err: e }, "Failed to enqueue refund email");
            }
        }
        return res.json({ status: "ok" });
    }
    catch (error) {
        try {
            await client.query("ROLLBACK");
        }
        catch {
            // ignore rollback failures
        }
        const dbError = error;
        if (dbError?.code === "23505") {
            logger_1.logger.warn({ provider: "razorpay", eventId, errorCode: "REPLAY_DETECTED" }, "Webhook replay ignored");
            (0, metrics_1.incrementMetric)("webhook_failures_total");
            return res.json({ status: "ignored" });
        }
        logger_1.logger.error({ err: error }, "Failed to process Razorpay webhook");
        return res.status(500).json({ error: "Failed to process webhook" });
    }
    finally {
        client.release();
    }
};
exports.handleRazorpayWebhook = handleRazorpayWebhook;
const handleShiprocketWebhook = async (req, res) => {
    const signatureHeader = req.headers["x-shiprocket-signature"] ??
        req.headers["x-webhook-signature"] ??
        req.headers["x-signature"];
    if (!env_1.env.SHIPROCKET_WEBHOOK_SECRET || !signatureHeader || Array.isArray(signatureHeader)) {
        logger_1.logger.warn({ provider: "shiprocket", errorCode: "SIGNATURE_MISSING" }, "Missing Shiprocket webhook signature or secret");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(401).json({ error: "Unauthorized" });
    }
    const rawBuffer = req.rawBody ??
        (Buffer.isBuffer(req.body) ? req.body : undefined);
    const rawBody = rawBuffer ? rawBuffer.toString("utf8") : "";
    const signature = String(signatureHeader)
        .replace(/^sha256=/i, "")
        .replace(/^hmac-sha256=/i, "");
    const expected = crypto_1.default
        .createHmac("sha256", env_1.env.SHIPROCKET_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    const timestampHeader = req.headers["x-shiprocket-timestamp"] ?? req.headers["x-timestamp"] ?? req.headers["x-webhook-timestamp"];
    if (timestampHeader && isTimestampTooOld(timestampHeader)) {
        logger_1.logger.warn({ provider: "shiprocket", errorCode: "TIMESTAMP_EXPIRED" }, "Webhook timestamp expired");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(401).json({ error: "Unauthorized" });
    }
    const isValid = signature.length === expected.length &&
        crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!isValid) {
        logger_1.logger.warn({ provider: "shiprocket", errorCode: "SIGNATURE_INVALID" }, "Invalid Shiprocket webhook signature");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(401).json({ error: "Unauthorized" });
    }
    let body;
    try {
        body = JSON.parse(rawBody);
    }
    catch (error) {
        logger_1.logger.warn({ provider: "shiprocket", errorCode: "INVALID_PAYLOAD" }, "Invalid Shiprocket webhook payload");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.status(400).json({ error: "Invalid payload" });
    }
    const providerEventId = body?.event_id ?? body?.eventId ?? body?.id ?? body?.data?.event_id ?? null;
    const eventId = providerEventId ?? crypto_1.default.createHash("sha256").update(rawBody).digest("hex");
    const processedResult = await pool_1.db.query(`INSERT INTO webhook_events_processed (provider, event_id)
     VALUES ($1, $2)
     ON CONFLICT (provider, event_id) DO NOTHING`, ["shiprocket", eventId]);
    if (processedResult.rowCount === 0) {
        logger_1.logger.warn({ provider: "shiprocket", eventId, errorCode: "REPLAY_DETECTED" }, "Webhook replay ignored");
        (0, metrics_1.incrementMetric)("webhook_failures_total");
        return res.json({ status: "ignored" });
    }
    const awbCode = body?.awb ??
        body?.awb_code ??
        body?.data?.awb_code ??
        body?.shipment?.awb ??
        body?.shipment?.awb_code ??
        null;
    const shiprocketOrderId = body?.order_id ??
        body?.orderId ??
        body?.data?.order_id ??
        body?.shipment?.order_id ??
        body?.shipment?.orderId ??
        null;
    const orderId = body?.order_reference_id ??
        body?.order_reference ??
        body?.data?.order_reference_id ??
        body?.order_reference_id ??
        null;
    const status = body?.status ??
        body?.current_status ??
        body?.shipment_status ??
        body?.data?.current_status ??
        "Unknown";
    const location = body?.location ?? body?.current_location ?? body?.data?.location ?? body?.shipment?.location ?? null;
    const courierName = body?.courier_name ?? body?.data?.courier_name ?? body?.shipment?.courier_name ?? null;
    const eventTimeRaw = body?.event_time ??
        body?.eventTime ??
        body?.status_time ??
        body?.timestamp ??
        body?.created_at ??
        null;
    const eventTime = eventTimeRaw ? new Date(eventTimeRaw) : new Date();
    const shipmentResult = shiprocketOrderId
        ? await pool_1.db.query(`SELECT id, order_id FROM order_shipments WHERE shiprocket_order_id = $1 LIMIT 1`, [shiprocketOrderId])
        : awbCode
            ? await pool_1.db.query(`SELECT id, order_id FROM order_shipments WHERE awb_code = $1 OR tracking_id = $1 LIMIT 1`, [awbCode])
            : orderId
                ? await pool_1.db.query(`SELECT id, order_id FROM order_shipments WHERE order_id = $1 LIMIT 1`, [orderId])
                : { rows: [] };
    const shipment = shipmentResult.rows[0];
    if (!shipment) {
        logger_1.logger.warn({ shiprocketOrderId, awbCode, orderId, provider: "shiprocket" }, "Shiprocket webhook shipment not found");
        return res.status(202).json({ status: "ignored" });
    }
    await pool_1.db.query(`UPDATE order_shipments
     SET shipment_status = COALESCE($2, shipment_status),
         awb_code = COALESCE($3, awb_code),
         courier_name = COALESCE($4, courier_name)
     WHERE id = $1`, [shipment.id, status, awbCode, courierName]);
    await pool_1.db.query(`INSERT INTO shipment_tracking_events (shipment_id, status, location, event_time)
     VALUES ($1, $2, $3, $4)`, [shipment.id, status ?? "Unknown", location, eventTime]);
    await (0, ordersService_2.logOrderTimeline)(pool_1.db, shipment.order_id, "SHIPMENT_STATUS", "shiprocket", {
        status,
        location,
        awbCode,
        courierName
    });
    await (0, cache_1.invalidatePattern)(`cache:orders:tracking:${shipment.order_id}`);
    return res.json({ status: "ok" });
};
exports.handleShiprocketWebhook = handleShiprocketWebhook;
const isTimestampTooOld = (timestampHeader) => {
    const value = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
    if (!value)
        return false;
    const numeric = Number(value);
    const timestampMs = Number.isFinite(numeric) ? numeric * (numeric > 1e12 ? 1 : 1000) : Date.parse(String(value));
    if (!Number.isFinite(timestampMs)) {
        return false;
    }
    return Date.now() - timestampMs > 5 * 60 * 1000;
};
//# sourceMappingURL=webhooksController.js.map
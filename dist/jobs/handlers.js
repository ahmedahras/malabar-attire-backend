"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorSellerIsolation = exports.scoreSellerRiskLegacy = exports.scoreSellerRisk = exports.revalidateSellerRisk = exports.financeSafeRecoveryCheck = exports.sendFinanceDigest = exports.runSellerRiskMonitor = exports.reconcileFinance = exports.createPayoutBatchesJob = exports.processSettlementsJob = exports.runSellerPayouts = exports.reconcilePayments = exports.processEvent = exports.refundReturn = exports.startReturnWindow = exports.batchNotifications = exports.sendEmailJob = exports.syncTrackingForActiveShipments = exports.createShipmentJob = exports.deliverNotificationJob = exports.reservationCleanup = exports.releaseExpiredReservations = exports.autoCloseDisputedReturns = exports.autoExpireReturnWindow = exports.autoCancelOrderIfUnpaid = exports.autoCancelUnpaidOrders = void 0;
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
const paymentsService_1 = require("../services/paymentsService");
const returnsService_1 = require("../services/returnsService");
const audit_1 = require("../utils/audit");
const logger_1 = require("../utils/logger");
const enqueue_1 = require("./enqueue");
const ordersService_1 = require("../services/ordersService");
const eventsService_1 = require("../services/eventsService");
const paymentsService_2 = require("../services/paymentsService");
const ordersService_2 = require("../services/ordersService");
const settlementService_1 = require("../services/settlementService");
const financeAlertsService_1 = require("../services/financeAlertsService");
const productLifecycleService_1 = require("../services/productLifecycleService");
const cache_1 = require("../utils/cache");
const metrics_1 = require("../utils/metrics");
const settlement_service_1 = require("../services/settlement.service");
const shippingService_1 = require("../services/shippingService");
const autoCancelUnpaidOrders = async () => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE status = 'CREATED'
         AND payment_status = 'pending'
         AND placed_at < NOW() - ($1 || ' minutes')::interval
       RETURNING id`, [env_1.env.ORDER_AUTO_CANCEL_MINUTES]);
        for (const row of rows) {
            await (0, ordersService_1.logOrderStatusChange)(client, row.id, "CREATED", "CANCELLED", null, "Auto-cancel unpaid order", "system");
            await (0, ordersService_1.logOrderTimeline)(client, row.id, "CANCELLED", "system", {
                reason: "auto_cancel_unpaid"
            });
            await (0, audit_1.logAudit)({
                entityType: "order",
                entityId: row.id,
                action: "status_change",
                fromState: "CREATED",
                toState: "CANCELLED",
                actorType: "system",
                metadata: { reason: "auto_cancel_unpaid" },
                client
            });
            await (0, eventsService_1.emitDomainEvent)("order.cancelled", { orderId: row.id, actorType: "system", actorId: null }, client);
        }
        await client.query("COMMIT");
        return { cancelled: rows.length };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.autoCancelUnpaidOrders = autoCancelUnpaidOrders;
const autoCancelOrderIfUnpaid = async (orderId) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
         AND status = 'CREATED'
         AND payment_status = 'pending'
       RETURNING id`, [orderId]);
        if (rows[0]) {
            await (0, ordersService_1.logOrderStatusChange)(client, rows[0].id, "CREATED", "CANCELLED", null, "Auto-cancel unpaid order", "system");
            await (0, ordersService_1.logOrderTimeline)(client, rows[0].id, "CANCELLED", "system", {
                reason: "auto_cancel_unpaid"
            });
            await (0, audit_1.logAudit)({
                entityType: "order",
                entityId: rows[0].id,
                action: "status_change",
                fromState: "CREATED",
                toState: "CANCELLED",
                actorType: "system",
                metadata: { reason: "auto_cancel_unpaid" },
                client
            });
            await (0, eventsService_1.emitDomainEvent)("order.cancelled", { orderId: rows[0].id, actorType: "system", actorId: null }, client);
        }
        await client.query("COMMIT");
        return { cancelled: rows.length };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.autoCancelOrderIfUnpaid = autoCancelOrderIfUnpaid;
const autoExpireReturnWindow = async () => {
    const { rowCount } = await pool_1.db.query(`UPDATE orders
     SET return_window_expired = TRUE, updated_at = NOW()
     WHERE return_window_expired = FALSE
       AND return_eligible_until IS NOT NULL
       AND return_eligible_until < NOW()`, []);
    return { expired: rowCount ?? 0 };
};
exports.autoExpireReturnWindow = autoExpireReturnWindow;
const autoCloseDisputedReturns = async () => {
    const { rows } = await pool_1.db.query(`SELECT id, status
     FROM return_requests
     WHERE status = 'DISPUTED'
       AND updated_at < NOW() - ($1 || ' days')::interval`, [env_1.env.DISPUTE_AUTO_CLOSE_DAYS]);
    let closed = 0;
    for (const row of rows) {
        if (!returnsService_1.allowedTransitions.DISPUTED.includes("ADMIN_REJECTED")) {
            continue;
        }
        await pool_1.db.query("BEGIN");
        try {
            await pool_1.db.query(`UPDATE return_requests
         SET status = 'ADMIN_REJECTED',
             decision_source = 'ADMIN',
             override_reason = 'Auto-closed due to inactivity',
             updated_at = NOW()
         WHERE id = $1`, [row.id]);
            await (0, returnsService_1.logReturnStatusChange)(pool_1.db, row.id, row.status, "ADMIN_REJECTED", null, "Auto-closed dispute", "system");
            await pool_1.db.query("COMMIT");
            closed += 1;
        }
        catch (error) {
            await pool_1.db.query("ROLLBACK");
            throw error;
        }
    }
    return { closed };
};
exports.autoCloseDisputedReturns = autoCloseDisputedReturns;
const releaseExpiredReservations = async () => {
    const { rowCount } = await pool_1.db.query(`UPDATE cart_item_reservations
     SET status = 'expired'
     WHERE status = 'active'
       AND expires_at < NOW()`, []);
    return { expired: rowCount ?? 0 };
};
exports.releaseExpiredReservations = releaseExpiredReservations;
const reservationCleanup = async () => {
    const { rowCount } = await pool_1.db.query(`UPDATE product_reservations
     SET status = 'EXPIRED'
     WHERE status = 'ACTIVE'
       AND expires_at < NOW()`, []);
    return { expired: rowCount ?? 0 };
};
exports.reservationCleanup = reservationCleanup;
const deliverNotificationJob = async (deliveryId) => {
    const { deliverNotification, markDeliveryAttempt } = await Promise.resolve().then(() => __importStar(require("../modules/notifications/notificationDelivery.service")));
    try {
        await markDeliveryAttempt(deliveryId);
        return await deliverNotification(deliveryId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await markDeliveryAttempt(deliveryId, message);
        throw error;
    }
};
exports.deliverNotificationJob = deliverNotificationJob;
const createShipmentJob = async (orderId) => {
    const client = await pool_1.db.connect();
    try {
        const orderResult = await client.query(`SELECT o.id,
              o.subtotal_amount,
              o.total_amount,
              o.payment_method,
              o.payment_status,
              o.shipping_address,
              o.placed_at,
              u.full_name AS customer_name,
              u.email,
              u.phone
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`, [orderId]);
        const order = orderResult.rows[0];
        if (!order) {
            return { status: "ignored", reason: "order_not_found" };
        }
        if (String(order.payment_status ?? "").toLowerCase() !== "paid") {
            throw new Error("Shipment creation is allowed only for paid orders");
        }
        if (String(order.payment_method ?? "").toLowerCase() == "cod") {
            throw new Error("COD orders are not eligible for Shiprocket shipment creation");
        }
        const itemsResult = await client.query(`SELECT oi.product_name,
              oi.quantity,
              oi.unit_price,
              oi.total_price,
              oi.variant_color_id,
              oi.size,
              p.shop_id,
              s.owner_user_id AS seller_id,
              s.name AS shop_name,
              s.shiprocket_pickup_name,
              s.shiprocket_pickup_address
       FROM order_items oi
       INNER JOIN products p ON p.id = oi.product_id
       INNER JOIN shops s ON s.id = p.shop_id
       WHERE oi.order_id = $1`, [orderId]);
        if (itemsResult.rows.length === 0) {
            return { status: "ignored", reason: "order_items_missing" };
        }
        const shippingAddress = (order.shipping_address ?? {});
        const weightKg = Number(shippingAddress.weightKg ??
            shippingAddress.weight ??
            0.5);
        const dimensions = {
            length: Number(shippingAddress.length ?? 10),
            breadth: Number(shippingAddress.breadth ?? 10),
            height: Number(shippingAddress.height ?? 5)
        };
        const groups = new Map();
        for (const item of itemsResult.rows) {
            const sellerId = String(item.seller_id ?? "");
            const shopId = String(item.shop_id ?? "");
            if (!sellerId || !shopId) {
                throw new Error("Unable to resolve seller for shipment item");
            }
            const key = `${sellerId}:${shopId}`;
            const existing = groups.get(key) ?? {
                sellerId,
                shopId,
                shopName: String(item.shop_name ?? "Seller"),
                pickupName: item.shiprocket_pickup_name ? String(item.shiprocket_pickup_name) : null,
                pickupAddress: item.shiprocket_pickup_address ?? null,
                subtotal: 0,
                items: []
            };
            existing.items.push({
                name: String(item.product_name ?? "Item"),
                sku: `${String(item.variant_color_id ?? "VAR")}:${String(item.size ?? "")}`,
                units: Number(item.quantity ?? 1),
                selling_price: Number(item.unit_price ?? 0)
            });
            existing.subtotal += Number(item.total_price ?? 0);
            groups.set(key, existing);
        }
        const shipments = [];
        for (const sellerGroup of groups.values()) {
            if (!sellerGroup.pickupName?.trim() || !sellerGroup.pickupAddress) {
                throw new Error(`Seller ${sellerGroup.sellerId} has no Shiprocket pickup address configured`);
            }
            const existingShipment = await client.query(`SELECT id, shiprocket_order_id, shiprocket_shipment_id, awb_code, courier_name, pickup_scheduled_at, shipment_status
         FROM order_shipments
         WHERE order_id = $1 AND seller_id = $2
         ORDER BY shipped_at DESC NULLS LAST
         LIMIT 1`, [orderId, sellerGroup.sellerId]);
            const shipmentRow = existingShipment.rows[0];
            let shiprocketOrderId = shipmentRow?.shiprocket_order_id ?? null;
            let shiprocketShipmentId = shipmentRow?.shiprocket_shipment_id ?? null;
            if (!shiprocketOrderId) {
                const orderRef = `${orderId}-${sellerGroup.sellerId.slice(0, 8)}`;
                const created = await (0, shippingService_1.createShipment)({
                    orderId: orderRef,
                    orderDate: new Date(order.placed_at ?? new Date()).toISOString(),
                    paymentMethod: String(order.payment_method ?? "prepaid"),
                    subtotalAmount: Number(sellerGroup.subtotal || order.subtotal_amount || 0),
                    declaredValue: Number(sellerGroup.subtotal || order.total_amount || 0),
                    shippingAddress,
                    customerName: String(order.customer_name ?? "Customer"),
                    customerEmail: order.email,
                    customerPhone: order.phone,
                    items: sellerGroup.items,
                    pickupLocation: sellerGroup.pickupName,
                    weightKg,
                    dimensions
                });
                shiprocketOrderId = created.shiprocketOrderId;
                shiprocketShipmentId = created.shiprocketShipmentId ?? null;
            }
            let awbCode = shipmentRow?.awb_code ?? null;
            let courierName = shipmentRow?.courier_name ?? null;
            if (!awbCode) {
                const assigned = await (0, shippingService_1.assignCourier)(shiprocketOrderId);
                awbCode = assigned.awbCode ?? awbCode;
                courierName = assigned.courierName ?? courierName;
            }
            let pickupScheduledAt = shipmentRow?.pickup_scheduled_at ?? null;
            if (!pickupScheduledAt) {
                const pickup = await (0, shippingService_1.schedulePickup)(shiprocketOrderId);
                pickupScheduledAt = pickup.pickupScheduledAt ?? pickupScheduledAt;
            }
            await client.query(`INSERT INTO order_shipments
         (order_id, seller_id, courier_name, tracking_id, tracking_url, shipped_at,
          shiprocket_order_id, shiprocket_shipment_id, awb_code, shipment_status, pickup_scheduled_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10)
         ON CONFLICT (order_id, seller_id) DO UPDATE
         SET courier_name = COALESCE(EXCLUDED.courier_name, order_shipments.courier_name),
             tracking_id = COALESCE(EXCLUDED.tracking_id, order_shipments.tracking_id),
             shiprocket_order_id = COALESCE(EXCLUDED.shiprocket_order_id, order_shipments.shiprocket_order_id),
             shiprocket_shipment_id = COALESCE(EXCLUDED.shiprocket_shipment_id, order_shipments.shiprocket_shipment_id),
             awb_code = COALESCE(EXCLUDED.awb_code, order_shipments.awb_code),
             shipment_status = COALESCE(EXCLUDED.shipment_status, order_shipments.shipment_status),
             pickup_scheduled_at = COALESCE(EXCLUDED.pickup_scheduled_at, order_shipments.pickup_scheduled_at)`, [
                orderId,
                sellerGroup.sellerId,
                courierName,
                awbCode,
                null,
                shiprocketOrderId,
                shiprocketShipmentId,
                awbCode,
                "SHIPMENT_CREATED",
                pickupScheduledAt ? new Date(pickupScheduledAt) : null
            ]);
            await (0, ordersService_1.logOrderTimeline)(client, orderId, "SHIPMENT_CREATED", "shiprocket", {
                sellerId: sellerGroup.sellerId,
                shiprocketOrderId,
                shiprocketShipmentId,
                awbCode,
                courierName
            });
            shipments.push({
                sellerId: sellerGroup.sellerId,
                shiprocketOrderId,
                shiprocketShipmentId,
                awbCode,
                courierName,
                shipmentStatus: "SHIPMENT_CREATED"
            });
        }
        await (0, cache_1.invalidatePattern)(`cache:orders:tracking:${orderId}`);
        return { status: "created", shipments };
    }
    catch (error) {
        logger_1.logger.error({ err: error, orderId }, "Shiprocket shipment automation failed");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.createShipmentJob = createShipmentJob;
const syncTrackingForActiveShipments = async () => {
    const { rows } = await pool_1.db.query(`SELECT os.id,
            os.order_id,
            os.awb_code,
            os.shipment_status
     FROM order_shipments os
     WHERE (os.shipment_status IS NULL OR os.shipment_status NOT IN ('DELIVERED', 'CANCELLED'))
       AND COALESCE(os.updated_at, os.shipped_at, NOW() - INTERVAL '31 minutes') < NOW() - INTERVAL '30 minutes'
       AND os.awb_code IS NOT NULL
     ORDER BY COALESCE(os.updated_at, os.shipped_at) ASC
     LIMIT 200`);
    let processed = 0;
    for (const shipment of rows) {
        try {
            const tracking = await (0, shippingService_1.fetchTracking)(String(shipment.awb_code));
            const latestStatus = tracking.status ?? shipment.shipment_status ?? null;
            const latestResult = await pool_1.db.query(`SELECT status, event_time
         FROM shipment_tracking_events
         WHERE shipment_id = $1
         ORDER BY event_time DESC
         LIMIT 1`, [shipment.id]);
            const latest = latestResult.rows[0];
            const newEvents = tracking.events.filter((event) => {
                if (!latest?.event_time) {
                    return true;
                }
                const eventTime = new Date(event.eventTime).getTime();
                const latestTime = new Date(latest.event_time).getTime();
                return eventTime > latestTime || event.status !== latest.status;
            });
            for (const event of newEvents) {
                await pool_1.db.query(`INSERT INTO shipment_tracking_events (shipment_id, status, location, event_time)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (
             SELECT 1
             FROM shipment_tracking_events
             WHERE shipment_id = $1 AND status = $2 AND event_time = $4
           )`, [shipment.id, event.status, event.location, new Date(event.eventTime)]);
            }
            if (latestStatus && latestStatus !== shipment.shipment_status) {
                await pool_1.db.query(`UPDATE order_shipments
           SET shipment_status = $2
           WHERE id = $1`, [shipment.id, latestStatus]);
                await (0, ordersService_1.logOrderTimeline)(pool_1.db, shipment.order_id, "SHIPMENT_STATUS", "shiprocket", {
                    status: latestStatus,
                    awbCode: shipment.awb_code
                });
            }
            if (newEvents.length > 0 || latestStatus !== shipment.shipment_status) {
                await (0, cache_1.invalidatePattern)(`cache:orders:tracking:${shipment.order_id}`);
            }
            processed += 1;
        }
        catch (error) {
            logger_1.logger.error({ err: error, shipmentId: shipment.id, awbCode: shipment.awb_code }, "Shiprocket tracking sync failed");
        }
    }
    return { processed, total: rows.length };
};
exports.syncTrackingForActiveShipments = syncTrackingForActiveShipments;
const sendEmailJob = async (input) => {
    const { getEmailProvider, RetryableEmailError } = await Promise.resolve().then(() => __importStar(require("../modules/notifications/providers/email.provider")));
    const email = getEmailProvider();
    const orderId = String(input.data.orderId ?? "");
    const amount = input.data.amount !== undefined ? Number(input.data.amount) : undefined;
    const courierName = input.data.courierName !== undefined ? String(input.data.courierName) : undefined;
    const trackingId = input.data.trackingId !== undefined ? String(input.data.trackingId) : undefined;
    const trackingUrl = input.data.trackingUrl !== undefined ? String(input.data.trackingUrl) : null;
    const payoutId = input.data.payoutId !== undefined ? String(input.data.payoutId) : "";
    try {
        let result;
        switch (input.template) {
            case "order_placed_customer":
                result = await email.sendOrderPlacedCustomer({ to: input.to, orderId, amount });
                break;
            case "order_placed_seller":
                result = await email.sendOrderPlacedSeller({ to: input.to, orderId, amount });
                break;
            case "order_shipped":
                result = await email.sendOrderShipped({
                    to: input.to,
                    orderId,
                    amount,
                    courierName,
                    trackingId,
                    trackingUrl
                });
                break;
            case "order_delivered":
                result = await email.sendOrderDelivered({
                    to: input.to,
                    orderId,
                    amount,
                    courierName,
                    trackingId,
                    trackingUrl
                });
                break;
            case "refund_approved":
                result = await email.sendRefundApproved({ to: input.to, orderId, amount: Number(amount ?? 0) });
                break;
            case "payout_processed":
                result = await email.sendPayoutProcessed({ to: input.to, payoutId, amount: Number(amount ?? 0) });
                break;
            // Existing templates that were already being enqueued elsewhere.
            case "order_confirmed_customer":
            case "order_confirmed_seller": {
                const subject = `Order confirmed: ${orderId || "—"}`;
                const html = `<div>Order ID: ${orderId || "—"}<br/>Status: CONFIRMED</div>`;
                result = await email.sendRaw({ to: input.to, subject, html });
                break;
            }
            default:
                throw new Error("Unknown email template");
        }
        if (env_1.env.EMAIL_PROVIDER === "sendgrid" && !result.skipped) {
            logger_1.logger.info({ template: input.template, to: input.to }, "[EMAIL_SENT]");
            (0, metrics_1.incrementMetric)("email_sent_total");
        }
        if (env_1.env.EMAIL_PROVIDER === "sendgrid" && result.skipped && result.reason !== "provider_disabled") {
            logger_1.logger.error({ template: input.template, to: input.to }, "[EMAIL_FAILED]");
            (0, metrics_1.incrementMetric)("email_failed_total");
        }
        return result;
    }
    catch (error) {
        if (error instanceof RetryableEmailError) {
            logger_1.logger.warn({ template: input.template, to: input.to, statusCode: error.statusCode }, "[EMAIL_RETRY]");
            (0, metrics_1.incrementMetric)("email_retry_total");
            throw error;
        }
        logger_1.logger.error({ template: input.template, to: input.to, err: error }, "[EMAIL_FAILED]");
        (0, metrics_1.incrementMetric)("email_failed_total");
        return { reference: `email:failed:${Date.now()}`, skipped: true };
    }
};
exports.sendEmailJob = sendEmailJob;
const batchNotifications = async () => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows: groups } = await client.query(`SELECT user_id, batch_key, COUNT(*)::int AS count
       FROM notifications
       WHERE batch_key IS NOT NULL
         AND batched_at IS NULL
         AND created_at >= NOW() - INTERVAL '1 minute'
       GROUP BY user_id, batch_key
       HAVING COUNT(*) > 1`);
        for (const group of groups) {
            const { rows: originals } = await client.query(`SELECT id, type
         FROM notifications
         WHERE user_id = $1
           AND batch_key = $2
           AND batched_at IS NULL
           AND created_at >= NOW() - INTERVAL '1 minute'
         ORDER BY created_at ASC
         FOR UPDATE`, [group.user_id, group.batch_key]);
            if (originals.length <= 1) {
                continue;
            }
            const { createNotification } = await Promise.resolve().then(() => __importStar(require("../modules/notifications/notification.service")));
            const title = "You have new updates";
            const message = `You have ${originals.length} new notifications.`;
            await createNotification({
                userId: group.user_id,
                type: "batch_summary",
                title,
                message,
                metadata: { batchKey: group.batch_key, count: originals.length },
                bypassRateLimit: true,
                client
            });
            const { rows: summaryRows } = await client.query(`SELECT id
         FROM notifications
         WHERE user_id = $1
           AND type = 'batch_summary'
           AND metadata->>'batchKey' = $2
         ORDER BY created_at DESC
         LIMIT 1`, [group.user_id, group.batch_key]);
            const summaryId = summaryRows[0]?.id;
            if (!summaryId) {
                continue;
            }
            await client.query(`UPDATE notifications
         SET batched_at = NOW(),
             batched_notification_id = $2
         WHERE id = ANY($1::uuid[])`, [originals.map((row) => row.id), summaryId]);
            await client.query(`UPDATE notification_deliveries
         SET status = 'FAILED',
             last_error = 'batched',
             updated_at = NOW()
         WHERE notification_id = ANY($1::uuid[])
           AND status = 'PENDING'`, [originals.map((row) => row.id)]);
        }
        await client.query("COMMIT");
        return { batched: groups.length };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.batchNotifications = batchNotifications;
const startReturnWindow = async (orderId) => {
    await pool_1.db.query(`UPDATE orders
     SET delivered_at = COALESCE(delivered_at, NOW()),
         return_eligible_until = COALESCE(return_eligible_until, NOW() + ($1 || ' days')::interval),
         return_window_expired = FALSE,
         updated_at = NOW()
     WHERE id = $2`, [env_1.env.RETURN_WINDOW_DAYS, orderId]);
    return { orderId };
};
exports.startReturnWindow = startReturnWindow;
const refundReturn = async (returnId) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id, status, seller_decision, order_id
       FROM return_requests
       WHERE id = $1`, [returnId]);
        const current = rows[0];
        if (!current) {
            await client.query("ROLLBACK");
            throw new Error("Return not found");
        }
        const allowed = returnsService_1.allowedTransitions[current.status] ?? [];
        if (!allowed.includes("REFUNDED")) {
            await client.query("ROLLBACK");
            throw new Error("Invalid state transition");
        }
        if (current.status === "RECEIVED_BY_SELLER" && current.seller_decision !== "APPROVED") {
            await client.query("ROLLBACK");
            throw new Error("Seller approval required");
        }
        await (0, paymentsService_1.refundPaymentForOrder)(current.order_id);
        const financials = await client.query(`SELECT seller_payout_amount, refunded_at
       FROM order_financials
       WHERE order_id = $1`, [current.order_id]);
        const fin = financials.rows[0];
        if (fin && !fin.refunded_at) {
            const sellerResult = await client.query(`SELECT s.owner_user_id AS seller_id
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE o.id = $1`, [current.order_id]);
            const sellerId = sellerResult.rows[0]?.seller_id;
            if (sellerId) {
                const adjustment = await (0, settlementService_1.applyRefundAdjustment)(client, {
                    sellerId,
                    orderId: current.order_id,
                    amount: Number(fin.seller_payout_amount),
                    type: "REFUND"
                });
                if (adjustment.pending < 0) {
                    await (0, audit_1.logAudit)({
                        entityType: "seller_balance",
                        entityId: sellerId,
                        action: "negative_balance",
                        actorType: "system",
                        metadata: { orderId: current.order_id }
                    });
                }
                await (0, ordersService_1.logOrderTimeline)(client, current.order_id, "ADJUSTMENT", "system", {
                    amount: Number(fin.seller_payout_amount),
                    type: "REFUND"
                });
            }
            await client.query(`UPDATE order_financials
         SET refunded_at = NOW()
         WHERE order_id = $1`, [current.order_id]);
        }
        await client.query(`UPDATE return_requests
       SET status = 'REFUNDED',
           updated_at = NOW()
       WHERE id = $1`, [returnId]);
        await (0, returnsService_1.logReturnStatusChange)(client, returnId, current.status, "REFUNDED", null, "Refunded", "system");
        await client.query("COMMIT");
        return { returnId };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.refundReturn = refundReturn;
const reserveStockForOrder = async (orderId) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows: items } = await client.query(`SELECT oi.variant_color_id, oi.size, oi.quantity, vc.product_id
       FROM order_items oi
       INNER JOIN product_variant_colors vc ON vc.id = oi.variant_color_id
       WHERE order_id = $1
       ORDER BY oi.variant_color_id, oi.size`, [orderId]);
        if (items.length === 0) {
            await client.query("ROLLBACK");
            throw new Error("No order items");
        }
        const productIds = new Set();
        for (const item of items) {
            productIds.add(item.product_id);
            const { rows } = await client.query(`SELECT stock
         FROM product_variant_sizes
         WHERE variant_color_id = $1 AND size = $2
         FOR UPDATE`, [item.variant_color_id, item.size]);
            const stock = rows[0]?.stock ?? 0;
            if (stock < item.quantity) {
                await client.query("ROLLBACK");
                throw new Error("Insufficient stock");
            }
            await client.query(`UPDATE product_variant_sizes
         SET stock = stock - $3
         WHERE variant_color_id = $1 AND size = $2`, [item.variant_color_id, item.size, item.quantity]);
        }
        await (0, productLifecycleService_1.markProductsOutOfStockIfNeeded)(client, Array.from(productIds));
        await client.query(`UPDATE orders
       SET status = 'CONFIRMED', updated_at = NOW()
       WHERE id = $1`, [orderId]);
        await (0, ordersService_1.logOrderStatusChange)(client, orderId, "PAID", "CONFIRMED", null, "Order confirmed after payment", "system");
        await (0, ordersService_1.logOrderTimeline)(client, orderId, "CONFIRMED", "system");
        await client.query("COMMIT");
        return { orderId };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
const processEvent = async (eventId) => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id, event_type, payload, attempts
       FROM domain_events
       WHERE id = $1
       FOR UPDATE`, [eventId]);
        const event = rows[0];
        if (!event) {
            await client.query("ROLLBACK");
            return { ignored: true };
        }
        const payload = event.payload;
        switch (event.event_type) {
            case "order.created":
                if (payload.orderId) {
                    await (0, enqueue_1.enqueueAutoCancelOrder)(payload.orderId);
                }
                break;
            case "order.paid":
                if (payload.orderId) {
                    await reserveStockForOrder(payload.orderId);
                    await (0, enqueue_1.cancelAutoCancelOrder)(payload.orderId);
                    await (0, eventsService_1.emitDomainEvent)("order.confirmed", {
                        orderId: payload.orderId,
                        actorType: "system",
                        actorId: null
                    });
                    const emailResult = await pool_1.db.query(`SELECT u.email AS customer_email, s.owner_user_id, so.email AS seller_email
             FROM orders o
             INNER JOIN users u ON u.id = o.user_id
             INNER JOIN shops s ON s.id = o.shop_id
             INNER JOIN users so ON so.id = s.owner_user_id
             WHERE o.id = $1`, [payload.orderId]);
                    const row = emailResult.rows[0];
                    if (row?.customer_email) {
                        await (0, enqueue_1.enqueueEmail)({
                            to: row.customer_email,
                            template: "order_confirmed_customer",
                            data: { orderId: payload.orderId }
                        });
                    }
                    if (row?.seller_email) {
                        await (0, enqueue_1.enqueueEmail)({
                            to: row.seller_email,
                            template: "order_confirmed_seller",
                            data: { orderId: payload.orderId }
                        });
                    }
                }
                break;
            case "order.delivered":
                if (payload.orderId) {
                    await (0, enqueue_1.enqueueStartReturnWindow)(payload.orderId);
                }
                break;
            case "order.cancelled":
                break;
            default:
                break;
        }
        await client.query(`UPDATE domain_events
       SET status = 'processed', processed_at = NOW()
       WHERE id = $1`, [eventId]);
        await client.query("COMMIT");
        return { processed: true };
    }
    catch (error) {
        await client.query("ROLLBACK");
        await pool_1.db.query(`UPDATE domain_events
       SET status = 'failed',
           attempts = attempts + 1,
           last_error = $2
       WHERE id = $1`, [eventId, error instanceof Error ? error.message : "Unknown error"]);
        throw error;
    }
    finally {
        client.release();
    }
};
exports.processEvent = processEvent;
const reconcilePayments = async () => {
    const { rows } = await pool_1.db.query(`SELECT pi.id, pi.order_id, pi.provider_order_id, o.total_amount
     FROM payment_intents pi
     INNER JOIN orders o ON o.id = pi.order_id
     WHERE pi.status IN ('created', 'authorized')
       AND pi.provider_order_id IS NOT NULL
       AND pi.updated_at < NOW() - '10 minutes'::interval
     LIMIT 100`, []);
    let processed = 0;
    for (const row of rows) {
        const order = await (0, paymentsService_2.fetchRazorpayOrder)(row.provider_order_id);
        const isPaid = order.status === "paid" || (order.amount_paid ?? 0) > 0;
        if (!isPaid) {
            continue;
        }
        const expectedPaise = Math.round(Number(row.total_amount) * 100);
        if (order.amount_paid && order.amount_paid !== expectedPaise) {
            await pool_1.db.query(`UPDATE payment_intents
         SET metadata = jsonb_set(metadata, '{amount_mismatch}', 'true'::jsonb),
             updated_at = NOW()
         WHERE id = $1`, [row.id]);
            await (0, audit_1.logAudit)({
                entityType: "payment",
                entityId: row.order_id,
                action: "amount_mismatch",
                actorType: "system",
                metadata: { amountCaptured: order.amount_paid, expectedPaise }
            });
            continue;
        }
        await pool_1.db.query(`UPDATE payment_intents
       SET status = 'captured', updated_at = NOW()
       WHERE id = $1`, [row.id]);
        await (0, ordersService_2.markOrderPaid)(row.order_id, "system", null, "reconciliation");
        processed += 1;
    }
    return { processed, pending: rows.length };
};
exports.reconcilePayments = reconcilePayments;
const runSellerPayouts = async () => {
    return {
        disabled: true,
        reason: "manual_payout_mode"
    };
};
exports.runSellerPayouts = runSellerPayouts;
const processSettlementsJob = async () => {
    return (0, settlement_service_1.processEligibleSettlements)();
};
exports.processSettlementsJob = processSettlementsJob;
const createPayoutBatchesJob = async () => {
    return {
        disabled: true,
        reason: "manual_payout_mode"
    };
};
exports.createPayoutBatchesJob = createPayoutBatchesJob;
const reconcileFinance = async () => {
    const [capturedResult, refundsResult, payoutsResult, commissionResult] = await Promise.all([
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS captured
         FROM payment_intents
         WHERE status = 'captured'`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS payouts
         FROM seller_payouts
         WHERE status = 'COMPLETED'`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(platform_commission_amount), 0)::numeric AS commission
         FROM order_financials`, [])
    ]);
    const captured = Number(capturedResult.rows[0]?.captured ?? 0);
    const refunds = Number(refundsResult.rows[0]?.refunds ?? 0);
    const payouts = Number(payoutsResult.rows[0]?.payouts ?? 0);
    const commission = Number(commissionResult.rows[0]?.commission ?? 0);
    const mismatch = Number((captured - refunds - payouts - commission).toFixed(2));
    await pool_1.db.query(`UPDATE system_state
     SET last_reconciliation_at = NOW(),
         mismatch_count_last_run = $1,
         failed_reconciliation_runs = CASE
           WHEN $1 = 0 THEN failed_reconciliation_runs
           ELSE failed_reconciliation_runs + 1
         END
     WHERE id = 1`, [Math.abs(mismatch) > env_1.env.FINANCE_MISMATCH_THRESHOLD ? 1 : 0]);
    if (Math.abs(mismatch) > env_1.env.FINANCE_MISMATCH_THRESHOLD) {
        await (0, audit_1.logAudit)({
            entityType: "finance",
            entityId: "00000000-0000-0000-0000-000000000000",
            action: "reconciliation_mismatch",
            actorType: "system",
            metadata: { captured, refunds, payouts, commission, mismatch }
        });
        await (0, financeAlertsService_1.createFinanceAlert)({
            type: "mismatch",
            metadata: { captured, refunds, payouts, commission, mismatch }
        });
    }
    return { captured, refunds, payouts, commission, mismatch };
};
exports.reconcileFinance = reconcileFinance;
const runSellerRiskMonitor = async () => {
    const sellers = await pool_1.db.query(`SELECT s.owner_user_id AS seller_id
     FROM shops s
     GROUP BY s.owner_user_id`, []);
    const alerts = [];
    for (const seller of sellers.rows) {
        const [salesResult, refundResult, balanceResult] = await Promise.all([
            pool_1.db.query(`SELECT COALESCE(SUM(of.order_total), 0)::numeric AS sales
         FROM order_financials of
         INNER JOIN orders o ON o.id = of.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments
         WHERE seller_id = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT pending_amount
         FROM seller_balance
         WHERE seller_id = $1`, [seller.seller_id])
        ]);
        const sales = Number(salesResult.rows[0]?.sales ?? 0);
        const refunds = Number(refundResult.rows[0]?.refunds ?? 0);
        const pending = Number(balanceResult.rows[0]?.pending_amount ?? 0);
        const refundRate = sales === 0 ? 0 : refunds / sales;
        if (refundRate > env_1.env.FINANCE_REFUND_RATE_THRESHOLD) {
            await (0, financeAlertsService_1.createFinanceAlert)({
                type: "high_refunds",
                metadata: { sellerId: seller.seller_id, refundRate }
            });
            alerts.push({ sellerId: seller.seller_id, type: "high_refunds" });
        }
        if (pending < -env_1.env.NEGATIVE_BALANCE_LIMIT) {
            await (0, financeAlertsService_1.createFinanceAlert)({
                type: "seller_negative_spike",
                metadata: { sellerId: seller.seller_id, pending }
            });
            alerts.push({ sellerId: seller.seller_id, type: "seller_negative_spike" });
        }
    }
    return { alerts: alerts.length };
};
exports.runSellerRiskMonitor = runSellerRiskMonitor;
const sendFinanceDigest = async () => {
    const [gmvResult, commissionResult, refundsResult, negativeSellersResult, mismatchResult] = await Promise.all([
        pool_1.db.query(`SELECT COALESCE(SUM(order_total), 0)::numeric AS gmv FROM order_financials`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(platform_commission_amount), 0)::numeric AS commission
         FROM order_financials`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments`, []),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM seller_balance
         WHERE pending_amount < 0`, []),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM finance_alerts
         WHERE type = 'mismatch'
           AND created_at >= NOW() - '24 hours'::interval`, [])
    ]);
    const digest = {
        gmv: gmvResult.rows[0]?.gmv ?? 0,
        commission: commissionResult.rows[0]?.commission ?? 0,
        refunds: refundsResult.rows[0]?.refunds ?? 0,
        newNegativeSellers: negativeSellersResult.rows[0]?.count ?? 0,
        mismatches: mismatchResult.rows[0]?.count ?? 0
    };
    if (env_1.env.ADMIN_FINANCE_EMAIL) {
        await (0, enqueue_1.enqueueEmail)({
            to: env_1.env.ADMIN_FINANCE_EMAIL,
            template: "finance_digest",
            data: digest
        });
    }
    return digest;
};
exports.sendFinanceDigest = sendFinanceDigest;
const financeSafeRecoveryCheck = async () => {
    const [mismatchResult, negativeResult, refundsResult, capturedResult, criticalAlerts] = await Promise.all([
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS captured
         FROM payment_intents
         WHERE status = 'captured'`, []),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM seller_balance
         WHERE pending_amount < 0`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments`, []),
        pool_1.db.query(`SELECT COALESCE(SUM(platform_commission_amount), 0)::numeric AS commission,
                COALESCE(SUM(order_total), 0)::numeric AS total
         FROM order_financials`, []),
        pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM finance_alerts
         WHERE resolved = FALSE
           AND severity = 'critical'`, [])
    ]);
    const captured = Number(mismatchResult.rows[0]?.captured ?? 0);
    const refunds = Number(refundsResult.rows[0]?.refunds ?? 0);
    const commission = Number(capturedResult.rows[0]?.commission ?? 0);
    const payouts = Number((await pool_1.db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS payouts
         FROM seller_payouts
         WHERE status = 'COMPLETED'`, [])).rows[0]?.payouts ?? 0);
    const mismatch = Number((captured - refunds - payouts - commission).toFixed(2));
    const blockingAlertCount = Number(criticalAlerts.rows[0]?.count ?? 0);
    const negativeCount = Number(negativeResult.rows[0]?.count ?? 0);
    const valid = Math.abs(mismatch) <= env_1.env.FINANCE_MISMATCH_THRESHOLD &&
        blockingAlertCount === 0 &&
        negativeCount === 0;
    if (!valid) {
        await (0, audit_1.logAudit)({
            entityType: "finance",
            entityId: "00000000-0000-0000-0000-000000000000",
            action: "safe_recovery_failed",
            actorType: "system",
            metadata: { mismatch, blockingAlertCount, negativeCount }
        });
        await (0, financeAlertsService_1.createFinanceAlert)({
            type: "ledger_inconsistency",
            metadata: { mismatch, blockingAlertCount, negativeCount }
        });
        return { recovered: false };
    }
    const riskSellers = await pool_1.db.query(`SELECT seller_id
     FROM seller_balance
     WHERE risk_flag = TRUE`, []);
    for (const seller of riskSellers.rows) {
        const balance = await pool_1.db.query(`SELECT pending_amount
       FROM seller_balance
       WHERE seller_id = $1`, [seller.seller_id]);
        if (Number(balance.rows[0]?.pending_amount ?? 0) >= 0) {
            await pool_1.db.query(`UPDATE seller_balance
         SET risk_flag = FALSE,
             risk_reason = NULL,
             risk_set_at = NULL
         WHERE seller_id = $1`, [seller.seller_id]);
            await (0, audit_1.logAudit)({
                entityType: "seller_balance",
                entityId: seller.seller_id,
                action: "SELLER_RISK_CLEARED",
                actorType: "system",
                metadata: {}
            });
        }
    }
    await pool_1.db.query(`UPDATE system_state
     SET finance_frozen = FALSE,
         payouts_frozen = FALSE,
         freeze_reason = NULL,
         last_safe_recovery_at = NOW(),
         updated_at = NOW()
     WHERE id = 1`, []);
    await pool_1.db.query(`UPDATE finance_alerts
     SET resolved = TRUE
     WHERE resolved = FALSE
       AND severity = 'critical'`, []);
    await (0, audit_1.logAudit)({
        entityType: "finance",
        entityId: "00000000-0000-0000-0000-000000000000",
        action: "SAFE_RECOVERY_EXECUTED",
        actorType: "system",
        metadata: { mismatch }
    });
    return { recovered: true };
};
exports.financeSafeRecoveryCheck = financeSafeRecoveryCheck;
const revalidateSellerRisk = async (sellerId) => {
    const state = await pool_1.db.query(`SELECT finance_frozen, last_reconciliation_at
     FROM system_state
     WHERE id = 1`, []);
    if (state.rows[0]?.finance_frozen) {
        return { skipped: true, reason: "platform_frozen" };
    }
    const sellers = sellerId
        ? await pool_1.db.query(`SELECT seller_id, risk_reason
         FROM seller_balance
         WHERE seller_id = $1 AND risk_flag = TRUE`, [sellerId])
        : await pool_1.db.query(`SELECT seller_id, risk_reason
         FROM seller_balance
         WHERE risk_flag = TRUE`, []);
    let cleared = 0;
    for (const seller of sellers.rows) {
        const [ordersResult, financialsResult, alertsResult, balanceResult] = await Promise.all([
            pool_1.db.query(`SELECT COALESCE(SUM(o.total_amount), 0)::numeric AS total
           FROM orders o
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT COALESCE(SUM(of.order_total), 0)::numeric AS total
           FROM order_financials of
           INNER JOIN orders o ON o.id = of.order_id
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count
           FROM finance_alerts
           WHERE resolved = FALSE
             AND metadata->>'sellerId' = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT pending_amount
           FROM seller_balance
           WHERE seller_id = $1`, [seller.seller_id])
        ]);
        const orderTotal = Number(ordersResult.rows[0]?.total ?? 0);
        const ledgerTotal = Number(financialsResult.rows[0]?.total ?? 0);
        const negative = Number(balanceResult.rows[0]?.pending_amount ?? 0) < 0;
        const alertCount = Number(alertsResult.rows[0]?.count ?? 0);
        const ledgerOk = Math.abs(orderTotal - ledgerTotal) < 0.01;
        const reconcileOk = Boolean(state.rows[0]?.last_reconciliation_at);
        if (ledgerOk && alertCount === 0 && !negative && reconcileOk) {
            await pool_1.db.query(`UPDATE seller_balance
         SET risk_flag = FALSE,
             risk_reason = NULL,
             risk_set_at = NULL,
             last_revalidation_check = NOW()
         WHERE seller_id = $1`, [seller.seller_id]);
            await (0, audit_1.logAudit)({
                entityType: "seller_balance",
                entityId: seller.seller_id,
                action: "SELLER_RISK_AUTO_CLEARED",
                actorType: "system",
                metadata: { orderTotal, ledgerTotal }
            });
            await (0, eventsService_1.emitDomainEvent)("seller_risk_resolved", {
                sellerId: seller.seller_id,
                actorType: "system",
                actorId: null
            });
            cleared += 1;
        }
        else {
            const reason = !ledgerOk
                ? "ledger_mismatch"
                : alertCount > 0
                    ? "alerts_pending"
                    : negative
                        ? "negative_balance"
                        : "reconciliation_missing";
            await pool_1.db.query(`UPDATE seller_balance
         SET risk_reason = $2,
             last_revalidation_check = NOW()
         WHERE seller_id = $1`, [seller.seller_id, reason]);
        }
    }
    return { cleared, total: sellers.rows.length };
};
exports.revalidateSellerRisk = revalidateSellerRisk;
const scoreSellerRisk = async () => {
    const { scoreAllSellers } = await Promise.resolve().then(() => __importStar(require("../services/riskEngineService")));
    return scoreAllSellers();
};
exports.scoreSellerRisk = scoreSellerRisk;
const scoreSellerRiskLegacy = async () => {
    const sellers = await pool_1.db.query(`SELECT s.owner_user_id AS seller_id
     FROM shops s
     GROUP BY s.owner_user_id`, []);
    let scored = 0;
    for (const seller of sellers.rows) {
        const sellerId = seller.seller_id;
        const [refundsResult, ordersResult, cancelledResult, failedPaymentsResult, paymentsResult, payoutHoldResult] = await Promise.all([
            pool_1.db.query(`SELECT COALESCE(SUM(ra.amount), 0)::numeric AS refunds
           FROM refund_adjustments ra
           WHERE ra.seller_id = $1
             AND ra.created_at >= NOW() - '7 days'::interval`, [sellerId]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0)::numeric AS total
           FROM orders o
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND o.created_at >= NOW() - '7 days'::interval`, [sellerId]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count
           FROM orders o
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND o.status = 'CANCELLED'
             AND o.created_at >= NOW() - '7 days'::interval`, [sellerId]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count
           FROM payment_intents pi
           INNER JOIN orders o ON o.id = pi.order_id
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND pi.status = 'failed'
             AND pi.created_at >= NOW() - '7 days'::interval`, [sellerId]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count
           FROM payment_intents pi
           INNER JOIN orders o ON o.id = pi.order_id
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE s.owner_user_id = $1
             AND pi.created_at >= NOW() - '7 days'::interval`, [sellerId]),
            pool_1.db.query(`SELECT COUNT(*)::int AS count
           FROM seller_payouts
           WHERE seller_id = $1 AND status = 'FAILED'
             AND created_at >= NOW() - '30 days'::interval`, [sellerId])
        ]);
        const orderCount = Number(ordersResult.rows[0]?.count ?? 0);
        const cancelledCount = Number(cancelledResult.rows[0]?.count ?? 0);
        const failedPaymentCount = Number(failedPaymentsResult.rows[0]?.count ?? 0);
        const paymentCount = Number(paymentsResult.rows[0]?.count ?? 0);
        const refunds = Number(refundsResult.rows[0]?.refunds ?? 0);
        const totalSales = Number(ordersResult.rows[0]?.total ?? 0);
        const refundRate = totalSales === 0 ? 0 : refunds / totalSales;
        const cancellationRate = orderCount === 0 ? 0 : cancelledCount / orderCount;
        const failedPaymentRatio = paymentCount === 0 ? 0 : failedPaymentCount / paymentCount;
        const payoutHoldCount = Number(payoutHoldResult.rows[0]?.count ?? 0);
        const negativeBalance = await pool_1.db.query(`SELECT pending_amount FROM seller_balance WHERE seller_id = $1`, [sellerId]);
        const negativeFreq = Number(negativeBalance.rows[0]?.pending_amount ?? 0) < 0 ? 1 : 0;
        const score = Math.min(100, Math.round(refundRate * 100 * 0.4 +
            cancellationRate * 100 * 0.2 +
            failedPaymentRatio * 100 * 0.2 +
            negativeFreq * 15 +
            payoutHoldCount * 5));
        const riskLevel = score >= env_1.env.RISK_SCORE_CRITICAL
            ? "critical"
            : score >= env_1.env.RISK_SCORE_THRESHOLD
                ? "watch"
                : "normal";
        await pool_1.db.query(`INSERT INTO seller_risk_metrics
       (seller_id, refund_rate_last_7_days, order_cancellation_rate, failed_payment_ratio,
        negative_balance_frequency, payout_hold_count, risk_score, risk_level, last_scored_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (seller_id) DO UPDATE SET
         refund_rate_last_7_days = EXCLUDED.refund_rate_last_7_days,
         order_cancellation_rate = EXCLUDED.order_cancellation_rate,
         failed_payment_ratio = EXCLUDED.failed_payment_ratio,
         negative_balance_frequency = EXCLUDED.negative_balance_frequency,
         payout_hold_count = EXCLUDED.payout_hold_count,
         risk_score = EXCLUDED.risk_score,
         risk_level = EXCLUDED.risk_level,
         last_scored_at = NOW()`, [
            sellerId,
            refundRate,
            cancellationRate,
            failedPaymentRatio,
            negativeFreq,
            payoutHoldCount,
            score,
            riskLevel
        ]);
        await pool_1.db.query(`UPDATE seller_balance
       SET risk_watch = $2,
           payout_hold = $3,
           risk_score = $4,
           last_score_at = NOW(),
           risk_below_threshold_since = CASE
             WHEN $5 = TRUE AND risk_below_threshold_since IS NULL THEN NOW()
             WHEN $5 = FALSE THEN NULL
             ELSE risk_below_threshold_since
           END
       WHERE seller_id = $1`, [sellerId, riskLevel !== "normal", riskLevel === "critical", score, riskLevel === "normal"]);
        await (0, audit_1.logAudit)({
            entityType: "seller_balance",
            entityId: sellerId,
            action: "SELLER_RISK_SCORE_UPDATED",
            actorType: "system",
            metadata: { score, riskLevel }
        });
        scored += 1;
    }
    return { scored };
};
exports.scoreSellerRiskLegacy = scoreSellerRiskLegacy;
const monitorSellerIsolation = async () => {
    const sellers = await pool_1.db.query(`SELECT sb.seller_id, sb.seller_financial_mode, sb.risk_score, sb.risk_below_threshold_since
     FROM seller_balance sb`, []);
    let updated = 0;
    for (const seller of sellers.rows) {
        const riskScore = Number(seller.risk_score ?? 0);
        const currentMode = seller.seller_financial_mode;
        const [alertsResult, balanceResult] = await Promise.all([
            pool_1.db.query(`SELECT COUNT(*)::int AS count
         FROM finance_alerts
         WHERE resolved = FALSE
           AND metadata->>'sellerId' = $1`, [seller.seller_id]),
            pool_1.db.query(`SELECT pending_amount
         FROM seller_balance
         WHERE seller_id = $1`, [seller.seller_id])
        ]);
        const negative = Number(balanceResult.rows[0]?.pending_amount ?? 0) < 0;
        const alertCount = Number(alertsResult.rows[0]?.count ?? 0);
        let nextMode = "NORMAL";
        if (riskScore >= env_1.env.RISK_SCORE_CRITICAL) {
            nextMode = "ISOLATED";
        }
        else if (riskScore >= env_1.env.RISK_SCORE_THRESHOLD) {
            nextMode = "MONITORED";
        }
        if (currentMode === "ISOLATED") {
            const since = seller.risk_below_threshold_since;
            const eligible = since &&
                Number(balanceResult.rows[0]?.pending_amount ?? 0) >= 0 &&
                alertCount === 0 &&
                new Date(since).getTime() <= Date.now() - 7 * 24 * 60 * 60 * 1000;
            if (!eligible) {
                nextMode = "ISOLATED";
            }
        }
        if (currentMode === "MONITORED") {
            const since = seller.risk_below_threshold_since;
            const eligible = since &&
                Number(balanceResult.rows[0]?.pending_amount ?? 0) >= 0 &&
                alertCount === 0 &&
                new Date(since).getTime() <= Date.now() - 7 * 24 * 60 * 60 * 1000;
            if (!eligible) {
                nextMode = "MONITORED";
            }
        }
        if (nextMode !== currentMode) {
            await pool_1.db.query(`UPDATE seller_balance
         SET seller_financial_mode = $2
         WHERE seller_id = $1`, [seller.seller_id, nextMode]);
            await (0, audit_1.logAudit)({
                entityType: "seller_balance",
                entityId: seller.seller_id,
                action: "SELLER_FINANCIAL_MODE_UPDATED",
                actorType: "system",
                metadata: { from: currentMode, to: nextMode }
            });
            updated += 1;
        }
        if (nextMode === "MONITORED") {
            await (0, audit_1.logAudit)({
                entityType: "seller_balance",
                entityId: seller.seller_id,
                action: "SELLER_MONITORED_MONITOR",
                actorType: "system",
                metadata: { riskScore, negative, alertCount }
            });
        }
    }
    return { updated };
};
exports.monitorSellerIsolation = monitorSellerIsolation;
//# sourceMappingURL=handlers.js.map
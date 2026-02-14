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
exports.getAdminOrderDetail = exports.getOrdersForAdmin = exports.markOrderPaid = exports.getOrderById = exports.emitOrderEvent = exports.logOrderTimeline = exports.logOrderStatusChange = exports.allowedOrderTransitions = void 0;
const pool_1 = require("../db/pool");
const audit_1 = require("../utils/audit");
const eventsService_1 = require("./eventsService");
const settlementService_1 = require("./settlementService");
const reservation_service_1 = require("../modules/reservations/reservation.service");
const paymentsService_1 = require("./paymentsService");
const financeAlertsService_1 = require("./financeAlertsService");
const cache_1 = require("../utils/cache");
const logger_1 = require("../utils/logger");
exports.allowedOrderTransitions = {
    CREATED: ["PAID", "PAYMENT_STOCK_FAILED", "CANCELLED"],
    PAID: ["CONFIRMED", "CANCELLED"],
    PAYMENT_STOCK_FAILED: [],
    CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: []
};
const logOrderStatusChange = async (client, orderId, fromStatus, toStatus, changedBy, note, actorType = "system") => {
    await client.query(`INSERT INTO order_status_history
     (order_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`, [orderId, fromStatus, toStatus, changedBy ?? null, note ?? null]);
    await (0, audit_1.logAudit)({
        entityType: "order",
        entityId: orderId,
        action: "status_change",
        fromState: fromStatus,
        toState: toStatus,
        actorType,
        actorId: changedBy ?? null,
        metadata: note ? { note } : {},
        client
    });
};
exports.logOrderStatusChange = logOrderStatusChange;
const logOrderTimeline = async (client, orderId, eventType, source, metadata) => {
    await client.query(`INSERT INTO order_timeline (order_id, event_type, source, metadata)
     VALUES ($1, $2, $3, $4)`, [orderId, eventType, source, JSON.stringify(metadata ?? {})]);
};
exports.logOrderTimeline = logOrderTimeline;
const emitOrderEvent = async (client, orderId, event, actorType, actorId) => {
    await (0, eventsService_1.emitDomainEvent)(event, {
        orderId,
        actorType,
        actorId: actorId ?? null
    }, client);
};
exports.emitOrderEvent = emitOrderEvent;
const getOrderById = async (orderId) => {
    const { rows } = await pool_1.db.query(`SELECT o.*, s.owner_user_id AS seller_id
     FROM orders o
     INNER JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1`, [orderId]);
    return rows[0];
};
exports.getOrderById = getOrderById;
const markOrderPaid = async (orderId, actorType, actorId, source = "webhook") => {
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT o.id, o.status, o.user_id, s.owner_user_id AS seller_id
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1
       FOR UPDATE`, [orderId]);
        const current = rows[0];
        if (!current) {
            await client.query("ROLLBACK");
            throw new Error("Order not found");
        }
        if (current.status === "PAID" || current.status === "CONFIRMED") {
            await client.query("COMMIT");
            return { id: orderId, status: "PAID" };
        }
        const allowed = exports.allowedOrderTransitions[current.status] ?? [];
        if (!allowed.includes("PAID")) {
            await client.query("ROLLBACK");
            throw new Error("Invalid status transition");
        }
        try {
            await (0, reservation_service_1.convertReservationsForOrder)(client, orderId, current.user_id);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Reservation failed";
            if (message === "Reservation expired" ||
                message === "Reservation mismatch" ||
                message === "Out of stock") {
                const refundMeta = await client.query(`SELECT pi.amount, pi.provider_payment_id, pi.provider_order_id
           FROM payment_intents pi
           WHERE pi.order_id = $1`, [orderId]);
                const orderTotalResult = await client.query(`SELECT total_amount FROM orders WHERE id = $1`, [orderId]);
                const refundAmount = Number(refundMeta.rows[0]?.amount ?? orderTotalResult.rows[0]?.total_amount ?? 0);
                const gatewayRef = refundMeta.rows[0]?.provider_payment_id ??
                    refundMeta.rows[0]?.provider_order_id ??
                    null;
                await client.query(`UPDATE orders
           SET status = 'PAYMENT_STOCK_FAILED',
               payment_status = 'paid',
               updated_at = NOW()
           WHERE id = $1`, [orderId]);
                await (0, exports.logOrderStatusChange)(client, orderId, current.status, "PAYMENT_STOCK_FAILED", actorId ?? null, "Payment captured but stock reservation expired", actorType);
                await (0, audit_1.logAudit)({
                    entityType: "payment",
                    entityId: orderId,
                    action: "payment_stock_failed",
                    actorType,
                    actorId: actorId ?? null,
                    metadata: { reason: message, gatewayRef },
                    client
                });
                await client.query(`INSERT INTO order_refunds (order_id, amount, status, gateway_reference, reason)
           VALUES ($1, $2, 'INITIATED', $3, $4)
           ON CONFLICT (order_id) DO UPDATE
           SET amount = EXCLUDED.amount,
               status = EXCLUDED.status,
               gateway_reference = EXCLUDED.gateway_reference,
               reason = EXCLUDED.reason,
               updated_at = NOW()`, [orderId, refundAmount, gatewayRef, "payment_stock_failed"]);
                const financials = await client.query(`SELECT of.order_id, of.seller_payout_amount, of.refunded_at, s.owner_user_id AS seller_id
           FROM order_financials of
           INNER JOIN orders o ON o.id = of.order_id
           INNER JOIN shops s ON s.id = o.shop_id
           WHERE of.order_id = $1`, [orderId]);
                const fin = financials.rows[0];
                if (fin && !fin.refunded_at) {
                    await client.query(`UPDATE order_financials
             SET refunded_at = NOW()
             WHERE order_id = $1`, [orderId]);
                    if (Number(fin.seller_payout_amount) > 0) {
                        await (0, settlementService_1.applyRefundAdjustment)(client, {
                            sellerId: fin.seller_id,
                            orderId,
                            amount: Number(fin.seller_payout_amount),
                            type: "REFUND"
                        });
                    }
                }
                await (0, paymentsService_1.refundPaymentForOrder)(orderId);
                await (0, financeAlertsService_1.createFinanceAlert)({
                    type: "ledger_inconsistency",
                    severity: "high",
                    metadata: { orderId, reason: message, gatewayRef }
                });
                await client.query("COMMIT");
                await (0, cache_1.invalidatePattern)(`cache:orders:customer:${current.user_id}:*`);
                if (current.seller_id) {
                    await (0, cache_1.invalidatePattern)(`cache:orders:seller:${current.seller_id}:*`);
                }
                return {
                    id: orderId,
                    status: "PAYMENT_STOCK_FAILED",
                    message: "Payment captured but stock expired. Refund initiated."
                };
            }
            throw error;
        }
        await client.query(`UPDATE orders
       SET status = 'PAID',
           payment_status = 'paid',
           updated_at = NOW()
       WHERE id = $1`, [orderId]);
        await (0, exports.logOrderStatusChange)(client, orderId, current.status, "PAID", actorId ?? null, "Payment captured", actorType);
        await (0, exports.logOrderTimeline)(client, orderId, "PAID", source);
        await (0, exports.emitOrderEvent)(client, orderId, "payment.captured", actorType, actorId ?? null);
        await (0, exports.emitOrderEvent)(client, orderId, "order.paid", actorType, actorId ?? null);
        await (0, audit_1.logAudit)({
            entityType: "payment",
            entityId: orderId,
            action: "payment_captured",
            actorType,
            actorId: actorId ?? null,
            metadata: { source },
            client
        });
        await client.query("COMMIT");
        await (0, cache_1.invalidatePattern)(`cache:orders:customer:${current.user_id}:*`);
        if (current.seller_id) {
            await (0, cache_1.invalidatePattern)(`cache:orders:seller:${current.seller_id}:*`);
        }
        // Transactional email (best-effort; never break order flow)
        try {
            const { enqueueEmail } = await Promise.resolve().then(() => __importStar(require("../jobs/enqueue")));
            const emailResult = await client.query(`SELECT o.id, o.total_amount, u.email AS customer_email, so.email AS seller_email
         FROM orders o
         INNER JOIN users u ON u.id = o.user_id
         INNER JOIN shops s ON s.id = o.shop_id
         INNER JOIN users so ON so.id = s.owner_user_id
         WHERE o.id = $1`, [orderId]);
            const row = emailResult.rows[0];
            const amount = Number(row?.total_amount ?? 0);
            if (row?.customer_email) {
                await enqueueEmail({
                    to: row.customer_email,
                    template: "order_placed_customer",
                    data: { orderId, amount }
                });
            }
            if (row?.seller_email) {
                await enqueueEmail({
                    to: row.seller_email,
                    template: "order_placed_seller",
                    data: { orderId, amount }
                });
            }
        }
        catch (e) {
            logger_1.logger.warn({ err: e, orderId }, "Failed to enqueue order placed email");
        }
        // Shiprocket shipping automation (best-effort; never break order flow)
        try {
            const { enqueueShippingCreate } = await Promise.resolve().then(() => __importStar(require("../jobs/enqueue")));
            await enqueueShippingCreate(orderId);
        }
        catch (e) {
            logger_1.logger.warn({ err: e, orderId }, "Failed to enqueue shipment automation");
        }
        return { id: orderId, status: "PAID" };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.markOrderPaid = markOrderPaid;
const getOrdersForAdmin = async (filters, pagination) => {
    const page = Math.max(1, pagination.page);
    const limit = Math.min(Math.max(pagination.limit, 1), 100);
    const offset = (page - 1) * limit;
    const params = [];
    const whereClauses = [];
    if (filters.status) {
        params.push(filters.status);
        whereClauses.push(`o.status = $${params.length}`);
    }
    if (filters.fromDate) {
        params.push(filters.fromDate);
        whereClauses.push(`o.created_at >= $${params.length}`);
    }
    if (filters.toDate) {
        params.push(filters.toDate);
        whereClauses.push(`o.created_at <= $${params.length}`);
    }
    if (filters.sellerId) {
        params.push(filters.sellerId);
        whereClauses.push(`s.owner_user_id = $${params.length}`);
    }
    if (filters.customerId) {
        params.push(filters.customerId);
        whereClauses.push(`o.user_id = $${params.length}`);
    }
    if (filters.search) {
        params.push(filters.search.trim());
        whereClauses.push(`o.id::text = $${params.length}`);
    }
    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    params.push(limit);
    params.push(offset);
    const query = `
    SELECT
      o.id AS order_id,
      o.user_id,
      o.total_amount,
      o.status,
      o.created_at,
      o.updated_at,
      u.full_name AS customer_name,
      u.email AS customer_email,
      s.owner_user_id AS seller_id,
      s.name AS shop_name,
      pi_latest.id AS payment_intent_id,
      pi_latest.provider_order_id,
      pi_latest.currency,
      COUNT(*) OVER() AS total_count
    FROM orders o
    INNER JOIN users u ON u.id = o.user_id
    INNER JOIN shops s ON s.id = o.shop_id
    LEFT JOIN LATERAL (
      SELECT id, provider_order_id, currency
      FROM payment_intents
      WHERE order_id = o.id
      ORDER BY updated_at DESC
      LIMIT 1
    ) pi_latest ON TRUE
    ${where}
    ORDER BY o.created_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;
    const { rows } = await pool_1.db.query(query, params);
    const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
    const data = rows.map((row) => ({
        orderId: row.order_id,
        status: row.status,
        totalAmount: Number(row.total_amount ?? 0),
        currency: row.currency ?? "INR",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paymentIntentId: row.payment_intent_id ?? null,
        providerOrderId: row.provider_order_id ?? null,
        customer: {
            id: row.user_id,
            name: row.customer_name ?? null,
            email: row.customer_email ?? null
        },
        seller: {
            id: row.seller_id,
            storeName: row.shop_name ?? null
        }
    }));
    return {
        data,
        pagination: {
            page,
            limit,
            total
        }
    };
};
exports.getOrdersForAdmin = getOrdersForAdmin;
const getAdminOrderDetail = async (orderId) => {
    const orderResult = await pool_1.db.query(`SELECT
       o.id,
       o.status,
       o.subtotal_amount,
       o.delivery_fee,
       o.total_amount,
       o.payment_method,
       o.payment_status,
       o.created_at,
       o.updated_at,
       o.shipping_address,
       u.id AS customer_id,
       u.full_name AS customer_name,
       u.email AS customer_email,
       s.owner_user_id AS seller_id,
       s.id AS shop_id,
       s.name AS shop_name,
       pi_latest.id AS payment_intent_id,
       pi_latest.provider_order_id,
       pi_latest.provider_payment_id,
       pi_latest.status AS payment_intent_status,
       pi_latest.amount AS payment_intent_amount,
       pi_latest.currency AS payment_intent_currency
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     INNER JOIN shops s ON s.id = o.shop_id
     LEFT JOIN LATERAL (
       SELECT id, provider_order_id, provider_payment_id, status, amount, currency
       FROM payment_intents
       WHERE order_id = o.id
       ORDER BY updated_at DESC
       LIMIT 1
     ) pi_latest ON TRUE
     WHERE o.id = $1`, [orderId]);
    const orderRow = orderResult.rows[0];
    if (!orderRow) {
        return null;
    }
    const itemsResult = await pool_1.db.query(`SELECT
       oi.id,
       oi.product_id,
       oi.variant_color_id,
       oi.product_name,
       oi.size,
       oi.color,
       oi.quantity,
       oi.unit_price,
       oi.total_price
     FROM order_items oi
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC`, [orderId]);
    const shippingAddress = (() => {
        const raw = orderRow.shipping_address;
        if (raw && typeof raw === "object") {
            return raw;
        }
        try {
            return raw ? JSON.parse(raw) : null;
        }
        catch {
            return null;
        }
    })();
    return {
        order: {
            id: orderRow.id,
            status: orderRow.status,
            subtotalAmount: Number(orderRow.subtotal_amount ?? 0),
            deliveryFee: Number(orderRow.delivery_fee ?? 0),
            totalAmount: Number(orderRow.total_amount ?? 0),
            paymentMethod: orderRow.payment_method,
            paymentStatus: orderRow.payment_status,
            createdAt: orderRow.created_at,
            updatedAt: orderRow.updated_at,
            shippingAddress
        },
        customer: {
            id: orderRow.customer_id,
            name: orderRow.customer_name ?? null,
            email: orderRow.customer_email ?? null
        },
        seller: {
            id: orderRow.seller_id,
            shopId: orderRow.shop_id,
            shopName: orderRow.shop_name ?? null
        },
        payment: {
            intentId: orderRow.payment_intent_id ?? null,
            providerOrderId: orderRow.provider_order_id ?? null,
            providerPaymentId: orderRow.provider_payment_id ?? null,
            status: orderRow.payment_intent_status ?? null,
            amount: orderRow.payment_intent_amount ? Number(orderRow.payment_intent_amount) : null,
            currency: orderRow.payment_intent_currency ?? null
        },
        items: itemsResult.rows.map((row) => ({
            id: row.id,
            productId: row.product_id,
            variantColorId: row.variant_color_id,
            productName: row.product_name,
            size: row.size ?? null,
            color: row.color ?? null,
            quantity: Number(row.quantity ?? 0),
            unitPrice: Number(row.unit_price ?? 0),
            totalPrice: Number(row.total_price ?? 0)
        }))
    };
};
exports.getAdminOrderDetail = getAdminOrderDetail;
//# sourceMappingURL=ordersService.js.map
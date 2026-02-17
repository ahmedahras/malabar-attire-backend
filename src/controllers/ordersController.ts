import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { keysToCamel } from "../utils/case";
import {
  allowedOrderTransitions,
  emitOrderEvent,
  logOrderStatusChange,
  markOrderPaid,
  type OrderStatus
} from "../services/ordersService";
import { logOrderTimeline } from "../services/ordersService";
import { logAudit } from "../utils/audit";
import { env } from "../config/env";
import { createNotification } from "../modules/notifications/notification.service";
import { getCache, getWithRefresh, invalidatePattern, setCache } from "../utils/cache";
import { logger } from "../utils/logger";
import { buildTrackingUrl, type CourierName } from "../utils/shippingTracking";
import { createShipmentJob } from "../jobs/handlers";

const createOrderSchema = z.object({
  cartId: z.string().uuid(),
  paymentIntentId: z.string().uuid().optional(),
  shippingAddress: z.record(z.string(), z.any()),
  idempotencyKey: z.string().optional()
});

const statusUpdateSchema = z.object({
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED"])
});

const shipOrderSchema = z.object({
  courier_name: z.enum(["DTDC", "Delhivery", "India Post", "BlueDart"]),
  tracking_id: z.string().trim().min(3).max(64)
});

export const createOrderFromCart = async (req: Request, res: Response) => {
  const body = createOrderSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (body.idempotencyKey) {
      const existing = await client.query(
        `SELECT id, status FROM orders WHERE user_id = $1 AND idempotency_key = $2`,
        [req.user.sub, body.idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return res.json({ id: existing.rows[0].id, status: existing.rows[0].status });
      }
    }

    const cartResult = await client.query(
      `SELECT id FROM carts WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [body.cartId, req.user.sub]
    );
    if (!cartResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cart not found" });
    }

    const itemsResult = await client.query(
      `SELECT ci.*, p.shop_id, p.name AS product_name, p.is_active AS product_active
              , ci.size, vc.color_name AS color
       FROM cart_items ci
       INNER JOIN products p ON p.id = ci.product_id
       INNER JOIN product_variant_colors vc ON vc.id = ci.variant_color_id
       WHERE ci.cart_id = $1`,
      [body.cartId]
    );

    if (itemsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Cart is empty" });
    }

    const unavailable = itemsResult.rows.find((row) => row.product_active !== true);
    if (unavailable) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Product unavailable" });
    }

    const neededByVariant = new Map<string, { variantColorId: string; size: string; needed: number }>();
    for (const item of itemsResult.rows) {
      const variantColorId = String(item.variant_color_id);
      const size = String(item.size);
      const key = `${variantColorId}:${size}`;
      const current = neededByVariant.get(key);
      if (current) {
        current.needed += Number(item.quantity);
      } else {
        neededByVariant.set(key, {
          variantColorId,
          size,
          needed: Number(item.quantity)
        });
      }
    }

    const shopIds = new Set(itemsResult.rows.map((row) => row.shop_id));
    if (shopIds.size > 1) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Cart contains multiple shops" });
    }

    const shopId = itemsResult.rows[0].shop_id as string;
    const subtotal = itemsResult.rows.reduce(
      (sum, item) => sum + Number(item.total_price_snapshot),
      0
    );
    const deliveryFee = 0;
    const total = subtotal + deliveryFee;

    const stateResult = await client.query(
      `SELECT finance_frozen FROM system_state WHERE id = 1`,
      []
    );
    if (stateResult.rows[0]?.finance_frozen && total >= env.HIGH_VALUE_ORDER_THRESHOLD) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Financial operations frozen" });
    }

    const sellerRisk = await client.query(
      `SELECT sb.risk_flag
       FROM shops s
       INNER JOIN seller_balance sb ON sb.seller_id = s.owner_user_id
       WHERE s.id = $1`,
      [shopId]
    );
    if (sellerRisk.rows[0]?.risk_flag) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Seller is under financial review" });
    }

    const sellerIdResult = await client.query(
      `SELECT owner_user_id AS seller_id FROM shops WHERE id = $1`,
      [shopId]
    );
    const sellerId = sellerIdResult.rows[0]?.seller_id as string | undefined;
    if (sellerId) {
      const { ensureOrderAllowedForSeller } = await import("../services/sellerModeEnforcer");
      const decision = await ensureOrderAllowedForSeller(sellerId, total);
      if (!decision.allowed) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: decision.reason });
      }
    }

    for (const { variantColorId, size, needed } of neededByVariant.values()) {
      const stockResult = await client.query(
        `SELECT stock
         FROM product_variant_sizes
         WHERE variant_color_id = $1
           AND size = $2
         FOR UPDATE`,
        [variantColorId, size]
      );
      const available = Number(stockResult.rows[0]?.stock ?? 0);
      if (available < needed) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Out of stock" });
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, shop_id, status, payment_method, payment_status, subtotal_amount, delivery_fee,
        total_amount, shipping_address, payment_intent_id, idempotency_key)
       VALUES ($1, $2, 'CREATED', 'razorpay', 'pending', $3, $4, $5, $6, $7, $8)
       RETURNING id, status`,
      [
        req.user.sub,
        shopId,
        subtotal,
        deliveryFee,
        total,
        JSON.stringify(body.shippingAddress),
        body.paymentIntentId ?? null,
        body.idempotencyKey ?? null
      ]
    );

    const orderId = orderResult.rows[0].id as string;

    for (const item of itemsResult.rows) {
      await client.query(
        `INSERT INTO order_items
         (order_id, variant_color_id, product_name, size, color,
          unit_price, quantity, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orderId,
          item.variant_color_id,
          item.product_name,
          item.size,
          item.color,
          item.unit_price_snapshot,
          item.quantity,
          item.total_price_snapshot
        ]
      );
    }

    await logOrderStatusChange(
      client,
      orderId,
      "CREATED",
      "CREATED",
      req.user.sub,
      "Order created from cart",
      "customer"
    );
    await logOrderTimeline(client, orderId, "CREATED", "system", {
      source: "order_creation"
    });

    await emitOrderEvent(client, orderId, "order.created", "customer", req.user.sub);

    await client.query(
      `UPDATE carts
       SET status = 'abandoned', updated_at = NOW()
       WHERE user_id = $1
         AND status = 'converted'
         AND id <> $2`,
      [req.user.sub, body.cartId]
    );

    await client.query(
      `UPDATE carts SET status = 'converted', updated_at = NOW() WHERE id = $1`,
      [body.cartId]
    );

    await client.query("COMMIT");

    await invalidatePattern(`cache:orders:customer:${req.user.sub}:*`);
    if (sellerId) {
      await invalidatePattern(`cache:orders:seller:${sellerId}:*`);
    }

    if (sellerId) {
      await createNotification({
        userId: sellerId,
        type: "order_created",
        title: "New order received",
        message: `Order ${orderId} has been placed.`,
        metadata: { orderId }
      });
    }

    return res.status(201).json({ id: orderId, status: "CREATED" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listOrdersForCustomer = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `cache:orders:customer:${req.user.sub}:${limit}:${offset}`;
  const cached = await getCache<{
    items: Array<Record<string, unknown>>;
    limit: number;
    offset: number;
  }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const { rows } = await db.query(
    `SELECT o.id, o.status, o.total_amount, o.placed_at, o.payment_status
     FROM orders o
     WHERE o.user_id = $1
     ORDER BY o.placed_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.sub, limit, offset]
  );
  const response = { items: rows.map((row) => keysToCamel(row)), limit, offset };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const getOrderById = async (req: Request, res: Response) => {
  const orderId = String(req.params.id);
  const orderResult = await db.query(
    `SELECT o.*, s.name AS shop_name
     FROM orders o
     INNER JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderResult.rows[0]) {
    return res.status(404).json({ error: "Order not found" });
  }

  const itemsResult = await db.query(
    `SELECT oi.*
     FROM order_items oi
     WHERE oi.order_id = $1`,
    [orderId]
  );

  return res.json({
    order: keysToCamel(orderResult.rows[0]),
    items: itemsResult.rows.map((row) => keysToCamel(row))
  });
};

export const getOrderTimeline = async (req: Request, res: Response) => {
  const orderId = String(req.params.id);
  const { rows } = await db.query(
    `SELECT id, order_id, event_type, source, metadata, created_at
     FROM order_timeline
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    [orderId]
  );

  return res.json({ items: rows.map((row) => keysToCamel(row)) });
};

export const getOrderShipment = async (req: Request, res: Response) => {
  const orderId = String(req.params.id);
  const { rows } = await db.query(
    `SELECT courier_name, tracking_id, tracking_url, shipped_at
     FROM order_shipments
     WHERE order_id = $1
     ORDER BY shipped_at DESC
     LIMIT 1`,
    [orderId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Shipment not found" });
  }

  return res.json(keysToCamel(rows[0]));
};

export const getOrderTracking = async (req: Request, res: Response) => {
  const orderId = String(req.params.id);
  const cacheKey = `cache:orders:tracking:${orderId}`;

  const tracking = await getWithRefresh(cacheKey, 300, async () => {
    const shipmentResult = await db.query(
      `SELECT id, courier_name, awb_code, shipment_status
       FROM order_shipments
       WHERE order_id = $1
       ORDER BY shipped_at DESC NULLS LAST
       LIMIT 1`,
      [orderId]
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) {
      return null;
    }

    const eventsResult = await db.query(
      `SELECT status, location, event_time
       FROM shipment_tracking_events
       WHERE shipment_id = $1
       ORDER BY event_time ASC`,
      [shipment.id]
    );

    return {
      courierName: shipment.courier_name ?? null,
      awbCode: shipment.awb_code ?? null,
      shipmentStatus: shipment.shipment_status ?? null,
      events: eventsResult.rows.map((row) => keysToCamel(row))
    };
  });

  if (!tracking) {
    return res.status(404).json({ error: "Tracking not found" });
  }

  return res.json(tracking);
};

export const shipOrder = async (req: Request, res: Response) => {
  const body = shipOrderSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const orderId = String(req.params.id);
  const courierName = body.courier_name as CourierName;
  const trackingId = body.tracking_id.trim();
  const trackingUrl = buildTrackingUrl(courierName, trackingId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT o.id, o.status, o.user_id, s.owner_user_id AS seller_id
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    const current = rows[0] as { status: OrderStatus; user_id: string; seller_id?: string | null } | undefined;
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    // idempotent: if shipment exists, return it
    const existing = await client.query(
      `SELECT courier_name, tracking_id, tracking_url, shipped_at
       FROM order_shipments
       WHERE order_id = $1
       ORDER BY shipped_at DESC
       LIMIT 1`,
      [orderId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return res.json({ id: orderId, status: current.status, shipment: keysToCamel(existing.rows[0]) });
    }

    const allowed = allowedOrderTransitions[current.status] ?? [];
    if (!allowed.includes("SHIPPED")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid status transition" });
    }

    await client.query(
      `INSERT INTO order_shipments
       (order_id, seller_id, courier_name, tracking_id, tracking_url, shipped_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [orderId, req.user.sub, courierName, trackingId, trackingUrl]
    );

    await client.query(
      `UPDATE orders
       SET status = 'SHIPPED', updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    await logOrderStatusChange(
      client,
      orderId,
      current.status,
      "SHIPPED",
      req.user.sub,
      "Seller marked order as shipped",
      "shop_owner"
    );
    await logOrderTimeline(client, orderId, "SHIPPED", "manual", { courierName, trackingId });
    await logAudit({
      entityType: "order_shipment",
      entityId: orderId,
      action: "seller_shipment_created",
      actorType: "shop_owner",
      actorId: req.user.sub,
      metadata: { courierName, trackingId }
    });

    await createNotification({
      userId: current.user_id,
      type: "order_status_update",
      title: "Order shipped",
      message: `Your order ${orderId} has been shipped via ${courierName}.`,
      metadata: { orderId, status: "SHIPPED", courierName, trackingId },
      client
    });

    await client.query("COMMIT");

    await invalidatePattern(`cache:orders:customer:${current.user_id}:*`);
    if (current.seller_id) {
      await invalidatePattern(`cache:orders:seller:${current.seller_id}:*`);
    }

    // Transactional email (best-effort)
    try {
      const { enqueueEmail } = await import("../jobs/enqueue");
      const emailRes = await client.query(`SELECT email FROM users WHERE id = $1`, [current.user_id]);
      const to = emailRes.rows[0]?.email as string | undefined;
      const amountRes = await client.query(`SELECT total_amount FROM orders WHERE id = $1`, [orderId]);
      const amount = Number(amountRes.rows[0]?.total_amount ?? 0);
      if (to) {
        await enqueueEmail({
          to,
          template: "order_shipped",
          data: { orderId, amount, courierName, trackingId, trackingUrl }
        });
      }
    } catch (e: unknown) {
      logger.warn({ err: e, orderId }, "Failed to enqueue shipped email");
    }

    return res.status(201).json({
      id: orderId,
      status: "SHIPPED",
      shipment: {
        courierName,
        trackingId,
        trackingUrl,
        shippedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (String(error?.code) === "23505") {
      return res.status(409).json({ error: "Shipment already exists" });
    }
    throw error;
  } finally {
    client.release();
  }
};

export const shipOrderViaShiprocket = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const orderId = String(req.params.id);

  const orderResult = await db.query(
    `SELECT o.id, o.status
     FROM orders o
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderResult.rows[0]) {
    return res.status(404).json({ error: "Order not found" });
  }

  try {
    const result = await createShipmentJob(orderId);

    const shipmentResult = await db.query(
      `SELECT courier_name, tracking_id, tracking_url, awb_code, shiprocket_order_id, shipment_status, pickup_scheduled_at
       FROM order_shipments
       WHERE order_id = $1
       ORDER BY shipped_at DESC NULLS LAST
       LIMIT 1`,
      [orderId]
    );

    return res.json({
      id: orderId,
      result,
      shipment: shipmentResult.rows[0] ? keysToCamel(shipmentResult.rows[0]) : null
    });
  } catch (error) {
    logger.error({ err: error, orderId }, "Shiprocket shipment trigger failed");
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Shiprocket shipment trigger failed"
    });
  }
};

export const listOrdersForSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `cache:orders:seller:${req.user.sub}:${limit}:${offset}`;
  const cached = await getCache<{
    items: Array<Record<string, unknown>>;
    limit: number;
    offset: number;
  }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const { rows } = await db.query(
    `SELECT o.id, o.status, o.total_amount, o.placed_at, o.payment_status, s.name AS shop_name
     FROM orders o
     INNER JOIN shops s ON s.id = o.shop_id
     WHERE s.owner_user_id = $1
     ORDER BY o.placed_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.sub, limit, offset]
  );
  const response = { items: rows.map((row) => keysToCamel(row)), limit, offset };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const body = statusUpdateSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const orderId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT o.id, o.status, o.user_id, s.owner_user_id AS seller_id
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1`,
      [orderId]
    );

    const current = rows[0] as { status: OrderStatus; user_id: string; seller_id?: string | null } | undefined;
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const allowed = allowedOrderTransitions[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid status transition" });
    }

    await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [body.status, orderId]
    );

    await logOrderStatusChange(
      client,
      orderId,
      current.status,
      body.status,
      req.user.sub,
      "Seller status update",
      "shop_owner"
    );
    if (
      body.status === "SHIPPED" ||
      body.status === "DELIVERED" ||
      body.status === "CANCELLED"
    ) {
      await logOrderTimeline(client, orderId, body.status, "manual");
    }
    await logAudit({
      entityType: "order",
      entityId: orderId,
      action: "order_status_manual_change",
      actorType: "shop_owner",
      actorId: req.user.sub,
      metadata: { status: body.status }
    });

    if (body.status === "DELIVERED") {
      await emitOrderEvent(client, orderId, "order.delivered", "shop_owner", req.user.sub);
    }

    if (body.status === "CANCELLED") {
      await emitOrderEvent(client, orderId, "order.cancelled", "shop_owner", req.user.sub);
    }

    await createNotification({
      userId: current.user_id,
      type: "order_status_update",
      title: "Order status updated",
      message: `Your order ${orderId} is now ${body.status}.`,
      metadata: { orderId, status: body.status },
      client
    });

    await client.query("COMMIT");

    await invalidatePattern(`cache:orders:customer:${current.user_id}:*`);
    if (current.seller_id) {
      await invalidatePattern(`cache:orders:seller:${current.seller_id}:*`);
    }

    // Transactional email (best-effort; never break API)
    if (body.status === "SHIPPED" || body.status === "DELIVERED") {
      try {
        const { enqueueEmail } = await import("../jobs/enqueue");
        const emailRes = await client.query(`SELECT email FROM users WHERE id = $1`, [current.user_id]);
        const to = emailRes.rows[0]?.email as string | undefined;
        if (to) {
          const amountRes = await client.query(`SELECT total_amount FROM orders WHERE id = $1`, [orderId]);
          const amount = Number(amountRes.rows[0]?.total_amount ?? 0);

          const shipRes = await client.query(
            `SELECT courier_name, tracking_id, tracking_url
             FROM order_shipments
             WHERE order_id = $1
             LIMIT 1`,
            [orderId]
          );
          const courierName = shipRes.rows[0]?.courier_name ?? null;
          const trackingId = shipRes.rows[0]?.tracking_id ?? null;
          const trackingUrl = shipRes.rows[0]?.tracking_url ?? null;

          await enqueueEmail({
            to,
            template: body.status === "SHIPPED" ? "order_shipped" : "order_delivered",
            data: { orderId, amount, courierName, trackingId, trackingUrl }
          });
        }
      } catch (e: unknown) {
        logger.warn({ err: e, orderId, status: body.status }, "Failed to enqueue order status email");
      }
    }

    return res.json({ id: orderId, status: body.status });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const confirmOrderPaid = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const orderId = String(req.params.id);
  const paymentResult = await db.query(
    `SELECT pi.status
     FROM orders o
     INNER JOIN payment_intents pi ON pi.id = o.payment_intent_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!paymentResult.rows[0]) {
    return res.status(404).json({ error: "Payment intent not found" });
  }

  if (paymentResult.rows[0].status !== "captured") {
    return res.status(409).json({ error: "Payment not captured" });
  }

  try {
    const result = await markOrderPaid(orderId, "admin", req.user.sub, "manual");
    return res.json(result);
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : "Error" });
  }
};

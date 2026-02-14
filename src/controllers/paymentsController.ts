import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { env } from "../config/env";
import { createRazorpayOrder } from "../services/paymentsService";
import { logger } from "../utils/logger";

const createIntentSchema = z.object({
  orderId: z.string().uuid(),
  idempotencyKey: z.string().min(8).optional()
});

export const createPaymentIntent = async (req: Request, res: Response) => {
  const body = createIntentSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, status, total_amount, user_id
       FROM orders
       WHERE id = $1`,
      [body.orderId]
    );

    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.user_id !== req.user.sub) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Forbidden" });
    }

    if (order.status !== "CREATED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Order not in CREATED state" });
    }

    const amountPaise = Math.round(Number(order.total_amount) * 100);

    if (body.idempotencyKey) {
      const existing = await client.query(
        `SELECT id, provider_order_id
         FROM payment_intents
         WHERE order_id = $1 AND idempotency_key = $2`,
        [body.orderId, body.idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return res.json({
          orderId: body.orderId,
          razorpayOrderId: existing.rows[0].provider_order_id,
          amount: amountPaise,
          currency: "INR",
          keyId: env.RAZORPAY_KEY_ID ?? null
        });
      }
    }

    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      currency: "INR",
      receipt: body.orderId
    });

    const { rows } = await client.query(
      `INSERT INTO payment_intents
       (order_id, user_id, provider, provider_order_id, status, amount, currency, idempotency_key)
       VALUES ($1, $2, 'razorpay', $3, 'created', $4, 'INR', $5)
       RETURNING id`,
      [
        body.orderId,
        req.user.sub,
        razorpayOrder.id,
        order.total_amount,
        body.idempotencyKey ?? razorpayOrder.id
      ]
    );

    const intentId = rows[0].id as string;

    await client.query(
      `UPDATE orders
       SET payment_intent_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [intentId, body.orderId]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      orderId: body.orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: amountPaise,
      currency: "INR",
      keyId: env.RAZORPAY_KEY_ID ?? null
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ err: error }, "Failed to create payment intent");
    throw error;
  } finally {
    client.release();
  }
};

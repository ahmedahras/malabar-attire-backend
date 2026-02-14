import Razorpay from "razorpay";
import { env } from "../config/env";
import { db } from "../db/pool";

const getRazorpayClient = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET
  });
};

export const createRazorpayOrder = async (input: {
  amountPaise: number;
  currency: string;
  receipt: string;
}) => {
  const razorpay = getRazorpayClient();
  return razorpay.orders.create({
    amount: input.amountPaise,
    currency: input.currency,
    receipt: input.receipt
  });
};

export const fetchRazorpayOrder = async (providerOrderId: string) => {
  const razorpay = getRazorpayClient();
  return razorpay.orders.fetch(providerOrderId);
};

export const refundPaymentForOrder = async (orderId: string) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existingRefund = await client.query(
      `SELECT status, gateway_reference
       FROM order_refunds
       WHERE order_id = $1`,
      [orderId]
    );
    const existing = existingRefund.rows[0] as
      | { status: "INITIATED" | "COMPLETED" | "FAILED"; gateway_reference?: string | null }
      | undefined;
    if (existing && (existing.status === "INITIATED" || existing.status === "COMPLETED")) {
      await client.query("COMMIT");
      return {
        orderId,
        status: existing.status.toLowerCase(),
        providerRefundId: existing.gateway_reference ?? null
      };
    }

    const paymentResult = await client.query(
      `SELECT amount, provider_payment_id
       FROM payment_intents
       WHERE order_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [orderId]
    );
    const payment = paymentResult.rows[0] as
      | { amount: string | number; provider_payment_id?: string | null }
      | undefined;
    const paymentId = payment?.provider_payment_id ?? null;
    if (!paymentId) {
      await client.query(
        `UPDATE order_refunds
         SET status = 'FAILED',
             updated_at = NOW()
         WHERE order_id = $1`,
        [orderId]
      );
      await client.query("COMMIT");
      return { orderId, status: "failed", providerRefundId: null };
    }

    const refundAmountPaise = Math.round(Number(payment?.amount ?? 0) * 100);
    const razorpay = getRazorpayClient();
    const refund = await razorpay.payments.refund(paymentId, {
      amount: refundAmountPaise,
      notes: { orderId }
    });

    const normalizeStatus = (status?: string | null) => {
      if (status === "processed" || status === "completed") {
        return "COMPLETED" as const;
      }
      if (status === "failed") {
        return "FAILED" as const;
      }
      return "INITIATED" as const;
    };
    const mappedStatus = normalizeStatus(refund?.status ?? null);
    const providerRefundId = refund?.id ?? null;

    await client.query(
      `INSERT INTO order_refunds (order_id, amount, status, gateway_reference, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO UPDATE
       SET amount = EXCLUDED.amount,
           status = EXCLUDED.status,
           gateway_reference = EXCLUDED.gateway_reference,
           updated_at = NOW()`,
      [orderId, payment?.amount ?? 0, mappedStatus, providerRefundId, "provider_refund"]
    );

    await client.query("COMMIT");
    return { orderId, status: mappedStatus.toLowerCase(), providerRefundId };
  } catch (error) {
    await client.query("ROLLBACK");
    try {
      await client.query(
        `UPDATE order_refunds
         SET status = 'FAILED',
             updated_at = NOW()
         WHERE order_id = $1`,
        [orderId]
      );
    } catch {
      // Ignore update failures after rollback.
    }
    throw error;
  } finally {
    client.release();
  }
};

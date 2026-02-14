"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentIntent = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
const paymentsService_1 = require("../services/paymentsService");
const logger_1 = require("../utils/logger");
const createIntentSchema = zod_1.z.object({
    orderId: zod_1.z.string().uuid(),
    idempotencyKey: zod_1.z.string().min(8).optional()
});
const createPaymentIntent = async (req, res) => {
    const body = createIntentSchema.parse(req.body);
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const orderResult = await client.query(`SELECT id, status, total_amount, user_id
       FROM orders
       WHERE id = $1`, [body.orderId]);
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
            const existing = await client.query(`SELECT id, provider_order_id
         FROM payment_intents
         WHERE order_id = $1 AND idempotency_key = $2`, [body.orderId, body.idempotencyKey]);
            if (existing.rows[0]) {
                await client.query("COMMIT");
                return res.json({
                    orderId: body.orderId,
                    razorpayOrderId: existing.rows[0].provider_order_id,
                    amount: amountPaise,
                    currency: "INR",
                    keyId: env_1.env.RAZORPAY_KEY_ID ?? null
                });
            }
        }
        const razorpayOrder = await (0, paymentsService_1.createRazorpayOrder)({
            amountPaise,
            currency: "INR",
            receipt: body.orderId
        });
        const { rows } = await client.query(`INSERT INTO payment_intents
       (order_id, user_id, provider, provider_order_id, status, amount, currency, idempotency_key)
       VALUES ($1, $2, 'razorpay', $3, 'created', $4, 'INR', $5)
       RETURNING id`, [
            body.orderId,
            req.user.sub,
            razorpayOrder.id,
            order.total_amount,
            body.idempotencyKey ?? razorpayOrder.id
        ]);
        const intentId = rows[0].id;
        await client.query(`UPDATE orders
       SET payment_intent_id = $1, updated_at = NOW()
       WHERE id = $2`, [intentId, body.orderId]);
        await client.query("COMMIT");
        return res.status(201).json({
            orderId: body.orderId,
            razorpayOrderId: razorpayOrder.id,
            amount: amountPaise,
            currency: "INR",
            keyId: env_1.env.RAZORPAY_KEY_ID ?? null
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        logger_1.logger.error({ err: error }, "Failed to create payment intent");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.createPaymentIntent = createPaymentIntent;
//# sourceMappingURL=paymentsController.js.map
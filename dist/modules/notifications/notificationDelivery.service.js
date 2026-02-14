"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverNotification = exports.markDeliveryFailed = exports.markDeliverySent = exports.markDeliveryAttempt = exports.getDeliveryWithNotification = void 0;
const pool_1 = require("../../db/pool");
const email_provider_1 = require("./providers/email.provider");
const push_provider_1 = require("./providers/push.provider");
const getDeliveryWithNotification = async (deliveryId) => {
    const { rows } = await pool_1.db.query(`SELECT d.id, d.channel, d.status, d.attempts, d.user_id,
            n.title, n.message, n.metadata, n.batched_notification_id,
            u.email
     FROM notification_deliveries d
     INNER JOIN notifications n ON n.id = d.notification_id
     INNER JOIN users u ON u.id = d.user_id
     WHERE d.id = $1`, [deliveryId]);
    return rows[0] ?? null;
};
exports.getDeliveryWithNotification = getDeliveryWithNotification;
const markDeliveryAttempt = async (deliveryId, error) => {
    await pool_1.db.query(`UPDATE notification_deliveries
     SET attempts = attempts + 1,
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`, [deliveryId, error ?? null]);
};
exports.markDeliveryAttempt = markDeliveryAttempt;
const markDeliverySent = async (deliveryId, reference) => {
    await pool_1.db.query(`UPDATE notification_deliveries
     SET status = 'SENT',
         provider_reference = $2,
         updated_at = NOW()
     WHERE id = $1`, [deliveryId, reference ?? null]);
};
exports.markDeliverySent = markDeliverySent;
const markDeliveryFailed = async (deliveryId, error) => {
    await pool_1.db.query(`UPDATE notification_deliveries
     SET status = 'FAILED',
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`, [deliveryId, error ?? null]);
};
exports.markDeliveryFailed = markDeliveryFailed;
const deliverNotification = async (deliveryId) => {
    const delivery = await (0, exports.getDeliveryWithNotification)(deliveryId);
    if (!delivery) {
        throw new Error("Delivery not found");
    }
    if (delivery.status === "SENT") {
        return { status: "already_sent" };
    }
    if (delivery.batched_notification_id) {
        await (0, exports.markDeliveryFailed)(deliveryId, "batched");
        return { status: "batched" };
    }
    let reference;
    if (delivery.channel === "email") {
        const result = await (0, email_provider_1.sendEmailNotification)({
            to: delivery.email,
            subject: delivery.title,
            html: delivery.message
        });
        reference = result.reference;
    }
    else if (delivery.channel === "push") {
        const token = delivery.metadata?.pushToken ?? "";
        const result = await (0, push_provider_1.sendPushNotification)({
            token,
            title: delivery.title,
            body: delivery.message
        });
        reference = result.reference;
    }
    else {
        throw new Error("Unsupported channel");
    }
    await (0, exports.markDeliverySent)(deliveryId, reference);
    return { status: "sent" };
};
exports.deliverNotification = deliverNotification;
//# sourceMappingURL=notificationDelivery.service.js.map
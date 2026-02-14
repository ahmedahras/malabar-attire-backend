import { db } from "../../db/pool";
import { sendEmailNotification } from "./providers/email.provider";
import { sendPushNotification } from "./providers/push.provider";

export const getDeliveryWithNotification = async (deliveryId: string) => {
  const { rows } = await db.query(
    `SELECT d.id, d.channel, d.status, d.attempts, d.user_id,
            n.title, n.message, n.metadata, n.batched_notification_id,
            u.email
     FROM notification_deliveries d
     INNER JOIN notifications n ON n.id = d.notification_id
     INNER JOIN users u ON u.id = d.user_id
     WHERE d.id = $1`,
    [deliveryId]
  );
  return rows[0] ?? null;
};

export const markDeliveryAttempt = async (deliveryId: string, error?: string) => {
  await db.query(
    `UPDATE notification_deliveries
     SET attempts = attempts + 1,
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, error ?? null]
  );
};

export const markDeliverySent = async (deliveryId: string, reference?: string | null) => {
  await db.query(
    `UPDATE notification_deliveries
     SET status = 'SENT',
         provider_reference = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, reference ?? null]
  );
};

export const markDeliveryFailed = async (deliveryId: string, error?: string) => {
  await db.query(
    `UPDATE notification_deliveries
     SET status = 'FAILED',
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, error ?? null]
  );
};

export const deliverNotification = async (deliveryId: string) => {
  const delivery = await getDeliveryWithNotification(deliveryId);
  if (!delivery) {
    throw new Error("Delivery not found");
  }
  if (delivery.status === "SENT") {
    return { status: "already_sent" };
  }
  if (delivery.batched_notification_id) {
    await markDeliveryFailed(deliveryId, "batched");
    return { status: "batched" };
  }

  let reference: string | undefined;
  if (delivery.channel === "email") {
    const result = await sendEmailNotification({
      to: delivery.email,
      subject: delivery.title,
      html: delivery.message
    });
    reference = result.reference;
  } else if (delivery.channel === "push") {
    const token = (delivery.metadata?.pushToken as string | undefined) ?? "";
    const result = await sendPushNotification({
      token,
      title: delivery.title,
      body: delivery.message
    });
    reference = result.reference;
  } else {
    throw new Error("Unsupported channel");
  }

  await markDeliverySent(deliveryId, reference);
  return { status: "sent" };
};

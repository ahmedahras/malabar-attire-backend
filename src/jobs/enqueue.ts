import { env } from "../config/env";
import { JOBS } from "./types";
import { logger } from "../utils/logger";

let warned = false;

const jobsDisabled = () => process.env.JOBS_ENABLED === "false" || !env.JOBS_ENABLED;

const getQueues = async () => {
  if (jobsDisabled()) {
    if (!warned) {
      logger.warn({ jobId: "jobs-disabled" }, "Jobs disabled (local dev mode)");
      warned = true;
    }
    return null;
  }
  return import("./queues");
};

export const enqueueReturnRequestedNotification = async (returnId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getNotificationsQueue().add(
    JOBS.NOTIFY_SELLER_RETURN_REQUESTED,
    { returnId },
    { removeOnComplete: true, removeOnFail: false }
  );
};

export const enqueueRefundJob = async (returnId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getRefundsQueue().add(
    JOBS.REFUND_RETURN,
    { returnId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );
};

export const enqueueStartReturnWindow = async (orderId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getAutomationQueue().add(
    JOBS.START_RETURN_WINDOW,
    { orderId },
    { removeOnComplete: true, removeOnFail: false }
  );
};

export const enqueueAutoCancelOrder = async (orderId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getAutomationQueue().add(
    JOBS.AUTO_CANCEL_ORDER,
    { orderId },
    {
      delay: env.ORDER_AUTO_CANCEL_MINUTES * 60 * 1000,
      removeOnComplete: true,
      removeOnFail: false,
      jobId: `order-auto-cancel:${orderId}`
    }
  );
};

export const cancelAutoCancelOrder = async (orderId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  const jobId = `order-auto-cancel:${orderId}`;
  const job = await queues.getAutomationQueue().getJob(jobId);
  if (job) {
    await job.remove();
  }
};

export const enqueueEmail = async (input: {
  to: string;
  template:
    | "order_confirmed_customer"
    | "order_confirmed_seller"
    | "order_placed_customer"
    | "order_placed_seller"
    | "order_shipped"
    | "order_delivered"
    | "refund_approved"
    | "payout_processed"
    | "finance_alert"
    | "finance_digest";
  data: Record<string, unknown>;
}) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getNotificationsQueue().add(
    JOBS.SEND_EMAIL,
    input,
    { removeOnComplete: true, removeOnFail: false }
  );
};

export const enqueueNotificationDelivery = async (
  deliveryId: string,
  options?: { delayMs?: number }
) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getNotificationDeliveryQueue().add(
    JOBS.DELIVER_NOTIFICATION,
    { deliveryId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      delay: options?.delayMs ?? 0,
      removeOnComplete: true,
      removeOnFail: false
    }
  );
};

export const enqueueShippingCreate = async (orderId: string) => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getAutomationQueue().add(
    JOBS.CREATE_SHIPMENT,
    { orderId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: true,
      removeOnFail: false,
      jobId: `shiprocket:create:${orderId}`
    }
  );
};

export const enqueueShipmentTrackingSync = async () => {
  const queues = await getQueues();
  if (!queues) return;
  await queues.getAutomationQueue().add(
    JOBS.SYNC_SHIPMENT_TRACKING,
    {},
    { removeOnComplete: true, removeOnFail: false }
  );
};

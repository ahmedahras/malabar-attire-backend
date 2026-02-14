import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";

let redisConnection: IORedis | null = null;
let automationQueue: Queue | null = null;
let refundsQueue: Queue | null = null;
let notificationsQueue: Queue | null = null;
let notificationDeliveryQueue: Queue | null = null;
let deadLetterQueue: Queue | null = null;
let eventsQueue: Queue | null = null;

export const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
  }
  return redisConnection;
};

export const closeRedisConnection = async () => {
  if (!redisConnection) return;
  try {
    await redisConnection.quit();
  } catch {
    redisConnection.disconnect();
  } finally {
    redisConnection = null;
  }
};

export const getAutomationQueue = () => {
  if (!automationQueue) {
    automationQueue = new Queue("automation", {
      connection: getRedisConnection()
    });
  }
  return automationQueue;
};

export const getRefundsQueue = () => {
  if (!refundsQueue) {
    refundsQueue = new Queue("refunds", {
      connection: getRedisConnection()
    });
  }
  return refundsQueue;
};

export const getNotificationsQueue = () => {
  if (!notificationsQueue) {
    notificationsQueue = new Queue("notifications", {
      connection: getRedisConnection()
    });
  }
  return notificationsQueue;
};

export const getNotificationDeliveryQueue = () => {
  if (!notificationDeliveryQueue) {
    notificationDeliveryQueue = new Queue("notification-delivery", {
      connection: getRedisConnection()
    });
  }
  return notificationDeliveryQueue;
};

export const getDeadLetterQueue = () => {
  if (!deadLetterQueue) {
    deadLetterQueue = new Queue("dead-letter", {
      connection: getRedisConnection()
    });
  }
  return deadLetterQueue;
};

export const getEventsQueue = () => {
  if (!eventsQueue) {
    eventsQueue = new Queue("events", {
      connection: getRedisConnection()
    });
  }
  return eventsQueue;
};


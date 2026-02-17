import { Queue } from "bullmq";
import { createRedisClient, type RedisClient } from "../lib/redis";

let redisConnection: RedisClient | null = null;
let automationQueue: Queue | null = null;
let refundsQueue: Queue | null = null;
let notificationsQueue: Queue | null = null;
let notificationDeliveryQueue: Queue | null = null;
let deadLetterQueue: Queue | null = null;
let eventsQueue: Queue | null = null;

export const getRedisConnection = () => {
  if (!redisConnection) {
    const connection = createRedisClient({ maxRetriesPerRequest: null });
    if (!connection) {
      throw new Error("Redis is disabled");
    }
    redisConnection = connection;
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

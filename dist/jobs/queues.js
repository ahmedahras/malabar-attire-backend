"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventsQueue = exports.getDeadLetterQueue = exports.getNotificationDeliveryQueue = exports.getNotificationsQueue = exports.getRefundsQueue = exports.getAutomationQueue = exports.closeRedisConnection = exports.getRedisConnection = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
let redisConnection = null;
let automationQueue = null;
let refundsQueue = null;
let notificationsQueue = null;
let notificationDeliveryQueue = null;
let deadLetterQueue = null;
let eventsQueue = null;
const getRedisConnection = () => {
    if (!redisConnection) {
        redisConnection = new ioredis_1.default(env_1.env.REDIS_URL, {
            maxRetriesPerRequest: null
        });
    }
    return redisConnection;
};
exports.getRedisConnection = getRedisConnection;
const closeRedisConnection = async () => {
    if (!redisConnection)
        return;
    try {
        await redisConnection.quit();
    }
    catch {
        redisConnection.disconnect();
    }
    finally {
        redisConnection = null;
    }
};
exports.closeRedisConnection = closeRedisConnection;
const getAutomationQueue = () => {
    if (!automationQueue) {
        automationQueue = new bullmq_1.Queue("automation", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return automationQueue;
};
exports.getAutomationQueue = getAutomationQueue;
const getRefundsQueue = () => {
    if (!refundsQueue) {
        refundsQueue = new bullmq_1.Queue("refunds", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return refundsQueue;
};
exports.getRefundsQueue = getRefundsQueue;
const getNotificationsQueue = () => {
    if (!notificationsQueue) {
        notificationsQueue = new bullmq_1.Queue("notifications", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return notificationsQueue;
};
exports.getNotificationsQueue = getNotificationsQueue;
const getNotificationDeliveryQueue = () => {
    if (!notificationDeliveryQueue) {
        notificationDeliveryQueue = new bullmq_1.Queue("notification-delivery", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return notificationDeliveryQueue;
};
exports.getNotificationDeliveryQueue = getNotificationDeliveryQueue;
const getDeadLetterQueue = () => {
    if (!deadLetterQueue) {
        deadLetterQueue = new bullmq_1.Queue("dead-letter", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return deadLetterQueue;
};
exports.getDeadLetterQueue = getDeadLetterQueue;
const getEventsQueue = () => {
    if (!eventsQueue) {
        eventsQueue = new bullmq_1.Queue("events", {
            connection: (0, exports.getRedisConnection)()
        });
    }
    return eventsQueue;
};
exports.getEventsQueue = getEventsQueue;
//# sourceMappingURL=queues.js.map
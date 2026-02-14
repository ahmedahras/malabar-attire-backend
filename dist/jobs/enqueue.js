"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueShipmentTrackingSync = exports.enqueueShippingCreate = exports.enqueueNotificationDelivery = exports.enqueueEmail = exports.cancelAutoCancelOrder = exports.enqueueAutoCancelOrder = exports.enqueueStartReturnWindow = exports.enqueueRefundJob = exports.enqueueReturnRequestedNotification = void 0;
const env_1 = require("../config/env");
const types_1 = require("./types");
const logger_1 = require("../utils/logger");
let warned = false;
const jobsDisabled = () => process.env.JOBS_ENABLED === "false" || !env_1.env.JOBS_ENABLED;
const getQueues = async () => {
    if (jobsDisabled()) {
        if (!warned) {
            logger_1.logger.warn({ jobId: "jobs-disabled" }, "Jobs disabled (local dev mode)");
            warned = true;
        }
        return null;
    }
    return Promise.resolve().then(() => __importStar(require("./queues")));
};
const enqueueReturnRequestedNotification = async (returnId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getNotificationsQueue().add(types_1.JOBS.NOTIFY_SELLER_RETURN_REQUESTED, { returnId }, { removeOnComplete: true, removeOnFail: false });
};
exports.enqueueReturnRequestedNotification = enqueueReturnRequestedNotification;
const enqueueRefundJob = async (returnId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getRefundsQueue().add(types_1.JOBS.REFUND_RETURN, { returnId }, {
        attempts: 5,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false
    });
};
exports.enqueueRefundJob = enqueueRefundJob;
const enqueueStartReturnWindow = async (orderId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getAutomationQueue().add(types_1.JOBS.START_RETURN_WINDOW, { orderId }, { removeOnComplete: true, removeOnFail: false });
};
exports.enqueueStartReturnWindow = enqueueStartReturnWindow;
const enqueueAutoCancelOrder = async (orderId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getAutomationQueue().add(types_1.JOBS.AUTO_CANCEL_ORDER, { orderId }, {
        delay: env_1.env.ORDER_AUTO_CANCEL_MINUTES * 60 * 1000,
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `order-auto-cancel:${orderId}`
    });
};
exports.enqueueAutoCancelOrder = enqueueAutoCancelOrder;
const cancelAutoCancelOrder = async (orderId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    const jobId = `order-auto-cancel:${orderId}`;
    const job = await queues.getAutomationQueue().getJob(jobId);
    if (job) {
        await job.remove();
    }
};
exports.cancelAutoCancelOrder = cancelAutoCancelOrder;
const enqueueEmail = async (input) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getNotificationsQueue().add(types_1.JOBS.SEND_EMAIL, input, { removeOnComplete: true, removeOnFail: false });
};
exports.enqueueEmail = enqueueEmail;
const enqueueNotificationDelivery = async (deliveryId, options) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getNotificationDeliveryQueue().add(types_1.JOBS.DELIVER_NOTIFICATION, { deliveryId }, {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        delay: options?.delayMs ?? 0,
        removeOnComplete: true,
        removeOnFail: false
    });
};
exports.enqueueNotificationDelivery = enqueueNotificationDelivery;
const enqueueShippingCreate = async (orderId) => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getAutomationQueue().add(types_1.JOBS.CREATE_SHIPMENT, { orderId }, {
        attempts: 5,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `shiprocket:create:${orderId}`
    });
};
exports.enqueueShippingCreate = enqueueShippingCreate;
const enqueueShipmentTrackingSync = async () => {
    const queues = await getQueues();
    if (!queues)
        return;
    await queues.getAutomationQueue().add(types_1.JOBS.SYNC_SHIPMENT_TRACKING, {}, { removeOnComplete: true, removeOnFail: false });
};
exports.enqueueShipmentTrackingSync = enqueueShipmentTrackingSync;
//# sourceMappingURL=enqueue.js.map
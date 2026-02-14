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
exports.shutdownWorkers = exports.workers = void 0;
const bullmq_1 = require("bullmq");
const logger_1 = require("./logger");
const queues_1 = require("./queues");
const types_1 = require("./types");
const handlers_1 = require("./handlers");
const createWorker = (queueName) => {
    return new bullmq_1.Worker(queueName, async (job) => {
        const startedAt = Date.now();
        try {
            let result = null;
            switch (job.name) {
                case types_1.JOBS.AUTO_CANCEL_UNPAID:
                    result = await (0, handlers_1.autoCancelUnpaidOrders)();
                    break;
                case types_1.JOBS.AUTO_CANCEL_ORDER:
                    result = await (0, handlers_1.autoCancelOrderIfUnpaid)(job.data.orderId);
                    break;
                case types_1.JOBS.AUTO_EXPIRE_RETURN_WINDOW:
                    result = await (0, handlers_1.autoExpireReturnWindow)();
                    break;
                case types_1.JOBS.AUTO_CLOSE_DISPUTED:
                    result = await (0, handlers_1.autoCloseDisputedReturns)();
                    break;
                case types_1.JOBS.RELEASE_RESERVATIONS:
                    result = await (0, handlers_1.releaseExpiredReservations)();
                    break;
                case types_1.JOBS.RESERVATION_CLEANUP:
                    result = await (0, handlers_1.reservationCleanup)();
                    break;
                case types_1.JOBS.START_RETURN_WINDOW:
                    result = await (0, handlers_1.startReturnWindow)(job.data.orderId);
                    break;
                case types_1.JOBS.REFUND_RETURN:
                    result = await (0, handlers_1.refundReturn)(job.data.returnId);
                    break;
                case types_1.JOBS.PROCESS_EVENT:
                    result = await (0, handlers_1.processEvent)(job.data.eventId);
                    break;
                case types_1.JOBS.RECONCILE_PAYMENTS:
                    result = await (0, handlers_1.reconcilePayments)();
                    break;
                case types_1.JOBS.RUN_PAYOUTS:
                    result = await (0, handlers_1.runSellerPayouts)();
                    break;
                case types_1.JOBS.FINANCE_RECONCILE:
                    result = await (0, handlers_1.reconcileFinance)();
                    break;
                case types_1.JOBS.FINANCE_RISK_MONITOR:
                    result = await (0, handlers_1.runSellerRiskMonitor)();
                    break;
                case types_1.JOBS.FINANCE_DIGEST:
                    result = await (0, handlers_1.sendFinanceDigest)();
                    break;
                case types_1.JOBS.FINANCE_SAFE_RECOVERY_CHECK:
                    result = await (0, handlers_1.financeSafeRecoveryCheck)();
                    break;
                case types_1.JOBS.SELLER_RISK_REVALIDATION:
                    result = await (0, handlers_1.revalidateSellerRisk)(job.data?.sellerId);
                    break;
                case types_1.JOBS.FINANCE_RISK_SCORING:
                    result = await (0, handlers_1.scoreSellerRisk)();
                    break;
                case types_1.JOBS.FINANCE_ISOLATION_MONITOR:
                    result = await (0, handlers_1.monitorSellerIsolation)();
                    break;
                case types_1.JOBS.NOTIFY_SELLER_RETURN_REQUESTED:
                    result = { notified: true, returnId: job.data.returnId };
                    break;
                case types_1.JOBS.SEND_EMAIL:
                    result = await (0, handlers_1.sendEmailJob)(job.data);
                    break;
                case types_1.JOBS.DELIVER_NOTIFICATION:
                    result = await (0, handlers_1.deliverNotificationJob)(job.data.deliveryId);
                    break;
                case types_1.JOBS.BATCH_NOTIFICATIONS:
                    result = await (0, handlers_1.batchNotifications)();
                    break;
                case types_1.JOBS.CREATE_SHIPMENT:
                    result = await (0, handlers_1.createShipmentJob)(job.data.orderId);
                    break;
                case types_1.JOBS.SYNC_SHIPMENT_TRACKING:
                    result = await (0, handlers_1.syncTrackingForActiveShipments)();
                    break;
                case types_1.JOBS.PROCESS_SETTLEMENTS:
                    result = await (0, handlers_1.processSettlementsJob)();
                    break;
                case types_1.JOBS.CREATE_PAYOUT_BATCHES:
                    result = await (0, handlers_1.createPayoutBatchesJob)();
                    break;
                default:
                    throw new Error("Unknown job");
            }
            await (0, logger_1.logJobResult)({
                queueName,
                jobName: job.name,
                status: "completed",
                attempts: job.attemptsMade,
                durationMs: Date.now() - startedAt,
                payload: job.data
            });
            return result;
        }
        catch (error) {
            await (0, logger_1.logJobResult)({
                queueName,
                jobName: job.name,
                status: "failed",
                attempts: job.attemptsMade,
                durationMs: Date.now() - startedAt,
                errorMessage: error instanceof Error ? error.message : "Unknown error",
                payload: job.data
            });
            if (job.name === types_1.JOBS.DELIVER_NOTIFICATION) {
                const { markDeliveryFailed } = await Promise.resolve().then(() => __importStar(require("../modules/notifications/notificationDelivery.service")));
                const maxAttempts = job.opts.attempts ?? 1;
                if (job.attemptsMade >= maxAttempts) {
                    await markDeliveryFailed(job.data.deliveryId, error instanceof Error ? error.message : "Unknown error");
                }
            }
            const maxAttempts = job.opts.attempts ?? 1;
            if (job.attemptsMade >= maxAttempts) {
                await (0, logger_1.logFailedJob)({
                    queueName,
                    jobName: job.name,
                    attempts: job.attemptsMade,
                    errorMessage: error instanceof Error ? error.message : "Unknown error",
                    payload: job.data
                });
                await (0, queues_1.getDeadLetterQueue)().add("dead-letter", {
                    queueName,
                    jobName: job.name,
                    payload: job.data,
                    errorMessage: error instanceof Error ? error.message : "Unknown error"
                }, { removeOnComplete: true, removeOnFail: false });
            }
            throw error;
        }
    }, { connection: (0, queues_1.getRedisConnection)() });
};
exports.workers = [
    createWorker("automation"),
    createWorker("refunds"),
    createWorker("notifications"),
    createWorker("notification-delivery"),
    createWorker("events")
];
const shutdownWorkers = async () => {
    await Promise.all(exports.workers.map((worker) => worker.close()));
};
exports.shutdownWorkers = shutdownWorkers;
//# sourceMappingURL=workers.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerScheduledJobs = void 0;
const queues_1 = require("./queues");
const types_1 = require("./types");
const registerScheduledJobs = async () => {
    const automationQueue = (0, queues_1.getAutomationQueue)();
    await automationQueue.add(types_1.JOBS.AUTO_CANCEL_UNPAID, {}, {
        repeat: { every: 5 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.AUTO_EXPIRE_RETURN_WINDOW, {}, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.AUTO_CLOSE_DISPUTED, {}, {
        repeat: { every: 6 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.RELEASE_RESERVATIONS, {}, {
        repeat: { every: 10 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.RESERVATION_CLEANUP, {}, {
        repeat: { every: 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.BATCH_NOTIFICATIONS, {}, {
        repeat: { every: 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.RECONCILE_PAYMENTS, {}, {
        repeat: { every: 15 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_RECONCILE, {}, {
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_RISK_MONITOR, {}, {
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_DIGEST, {}, {
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_SAFE_RECOVERY_CHECK, {}, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.SELLER_RISK_REVALIDATION, {}, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_RISK_SCORING, {}, {
        repeat: { every: 6 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.FINANCE_ISOLATION_MONITOR, {}, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.SYNC_SHIPMENT_TRACKING, {}, {
        repeat: { every: 30 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    await automationQueue.add(types_1.JOBS.PROCESS_SETTLEMENTS, {}, {
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false
    });
    // Payout batching is manual-only in Model A. No scheduled payout jobs.
};
exports.registerScheduledJobs = registerScheduledJobs;
//# sourceMappingURL=scheduler.js.map
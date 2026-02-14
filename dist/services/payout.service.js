"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markPayoutAsPaid = exports.createPayoutBatchesFromLedger = void 0;
const logger_1 = require("../utils/logger");
const createPayoutBatchesFromLedger = async () => {
    logger_1.logger.info("Automatic payout batch creation is disabled in manual payout mode");
    return { disabled: true, reason: "manual_payout_mode" };
};
exports.createPayoutBatchesFromLedger = createPayoutBatchesFromLedger;
const markPayoutAsPaid = async (payoutId) => {
    logger_1.logger.info({ payoutId }, "markPayoutAsPaid is deprecated; use admin payout status transition");
    return { updated: false, deprecated: true };
};
exports.markPayoutAsPaid = markPayoutAsPaid;
//# sourceMappingURL=payout.service.js.map
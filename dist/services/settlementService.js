"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRefundAdjustment = exports.executePayout = exports.buildPayoutCycleKey = exports.calculateCommission = void 0;
const calculateCommission = (orderTotal, commissionPercent) => {
    const platformCommissionAmount = Number((orderTotal * (commissionPercent / 100)).toFixed(2));
    const sellerPayoutAmount = Number((orderTotal - platformCommissionAmount).toFixed(2));
    return {
        commissionPercent,
        platformCommissionAmount,
        sellerPayoutAmount
    };
};
exports.calculateCommission = calculateCommission;
const buildPayoutCycleKey = (date = new Date()) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
exports.buildPayoutCycleKey = buildPayoutCycleKey;
const executePayout = async (_client, _sellerId, _cycleKey, _threshold) => {
    return { skipped: true, reason: "disabled_manual_payout_mode" };
};
exports.executePayout = executePayout;
const applyRefundAdjustment = async (client, input) => {
    await client.query(`INSERT INTO refund_adjustments (seller_id, order_id, amount, type)
     VALUES ($1, $2, $3, $4)`, [input.sellerId, input.orderId, input.amount, input.type]);
    const { rows } = await client.query(`UPDATE seller_balance
     SET pending_amount = pending_amount - $2,
         updated_at = NOW()
     WHERE seller_id = $1
     RETURNING pending_amount`, [input.sellerId, input.amount]);
    const pending = Number(rows[0]?.pending_amount ?? 0);
    return { pending };
};
exports.applyRefundAdjustment = applyRefundAdjustment;
//# sourceMappingURL=settlementService.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markLedgerSettledForPayout = exports.insertLedgerEntryIdempotent = void 0;
const pool_1 = require("../db/pool");
const getRunner = (runner) => runner ?? pool_1.db;
const insertLedgerEntryIdempotent = async (input, runner) => {
    const client = getRunner(runner);
    const normalizedAmount = Number(input.amount.toFixed(2));
    const result = await client.query(`INSERT INTO seller_ledger (seller_id, order_id, amount, type, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (seller_id, order_id, type, reason) DO NOTHING
     RETURNING id`, [input.sellerId, input.orderId, normalizedAmount, input.type, input.reason]);
    return {
        inserted: Boolean(result.rows[0]),
        ledgerId: result.rows[0]?.id ?? null
    };
};
exports.insertLedgerEntryIdempotent = insertLedgerEntryIdempotent;
const markLedgerSettledForPayout = async (sellerId, payoutId, runner) => {
    const client = getRunner(runner);
    const update = await client.query(`UPDATE seller_ledger
     SET settled_at = NOW(),
         payout_id = $2
     WHERE seller_id = $1
       AND settled_at IS NULL
       AND type = 'CREDIT'
     RETURNING id`, [sellerId, payoutId]);
    return { settledCount: update.rows.length };
};
exports.markLedgerSettledForPayout = markLedgerSettledForPayout;
//# sourceMappingURL=ledger.service.js.map
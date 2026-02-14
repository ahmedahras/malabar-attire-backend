"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayoutHistory = exports.getLedgerHistory = exports.getEarningsSummary = void 0;
const pool_1 = require("../../db/pool");
const getEarningsSummary = async (sellerId) => {
    const [ledgerResult, availableResult, holdResult, paidResult, rtoResult] = await Promise.all([
        pool_1.db.query(`SELECT COALESCE(
                SUM(
                  CASE
                    WHEN sl.type = 'CREDIT' THEN sl.amount
                    WHEN sl.type = 'DEBIT' THEN -sl.amount
                    ELSE 0
                  END
                ),
                0
              ) AS total_earned
       FROM seller_ledger sl
       WHERE sl.seller_id = $1`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(
                SUM(
                  CASE
                    WHEN sl.type = 'CREDIT' THEN sl.amount
                    WHEN sl.type = 'DEBIT' THEN -sl.amount
                    ELSE 0
                  END
                ),
                0
              ) AS available_for_payout
       FROM seller_ledger sl
       WHERE sl.seller_id = $1
         AND sl.settled_at IS NULL`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(SUM(hold.item_total), 0) AS in_hold
       FROM (
         SELECT oi.order_id,
                COALESCE(SUM(oi.total_price), 0)::numeric AS item_total
         FROM order_items oi
         INNER JOIN products p ON p.id = oi.product_id
         INNER JOIN shops s ON s.id = p.shop_id
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE s.owner_user_id = $1
           AND o.settlement_status = 'PENDING'
           AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         GROUP BY oi.order_id
       ) hold`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(SUM(sp.total_amount), 0) AS already_paid
       FROM seller_payouts sp
       WHERE sp.seller_id = $1
         AND sp.status = 'PAID'`, [sellerId]),
        pool_1.db.query(`SELECT COALESCE(SUM(sl.amount), 0) AS rto_deductions
       FROM seller_ledger sl
       WHERE sl.seller_id = $1
         AND sl.type = 'DEBIT'
         AND sl.reason ILIKE '%RTO%'`, [sellerId])
    ]);
    return {
        totalEarned: Number(ledgerResult.rows[0]?.total_earned ?? 0),
        availableForPayout: Number(availableResult.rows[0]?.available_for_payout ?? 0),
        inHold: Number(holdResult.rows[0]?.in_hold ?? 0),
        alreadyPaid: Number(paidResult.rows[0]?.already_paid ?? 0),
        rtoDeductions: Number(rtoResult.rows[0]?.rto_deductions ?? 0)
    };
};
exports.getEarningsSummary = getEarningsSummary;
const getLedgerHistory = async (sellerId, limit, offset) => {
    const [itemsResult, totalResult] = await Promise.all([
        pool_1.db.query(`SELECT sl.id,
              sl.order_id,
              sl.amount,
              sl.type,
              sl.reason,
              sl.created_at,
              sl.settled_at,
              sl.payout_id
       FROM seller_ledger sl
       WHERE sl.seller_id = $1
       ORDER BY sl.created_at DESC
       LIMIT $2 OFFSET $3`, [sellerId, limit, offset]),
        pool_1.db.query(`SELECT COUNT(*)::int AS total
       FROM seller_ledger sl
       WHERE sl.seller_id = $1`, [sellerId])
    ]);
    return {
        items: itemsResult.rows.map((row) => ({
            id: row.id,
            orderId: row.order_id,
            amount: Number(row.amount ?? 0),
            type: row.type,
            reason: row.reason,
            createdAt: row.created_at,
            settledAt: row.settled_at,
            payoutId: row.payout_id
        })),
        total: Number(totalResult.rows[0]?.total ?? 0)
    };
};
exports.getLedgerHistory = getLedgerHistory;
const getPayoutHistory = async (sellerId, limit, offset) => {
    const [itemsResult, totalResult] = await Promise.all([
        pool_1.db.query(`SELECT sp.id,
              sp.total_amount,
              sp.status,
              sp.created_at,
              sp.paid_at
       FROM seller_payouts sp
       WHERE sp.seller_id = $1
       ORDER BY sp.created_at DESC
       LIMIT $2 OFFSET $3`, [sellerId, limit, offset]),
        pool_1.db.query(`SELECT COUNT(*)::int AS total
       FROM seller_payouts sp
       WHERE sp.seller_id = $1`, [sellerId])
    ]);
    return {
        items: itemsResult.rows.map((row) => ({
            payoutId: row.id,
            totalAmount: Number(row.total_amount ?? 0),
            status: row.status,
            createdAt: row.created_at,
            paidAt: row.paid_at
        })),
        total: Number(totalResult.rows[0]?.total ?? 0)
    };
};
exports.getPayoutHistory = getPayoutHistory;
//# sourceMappingURL=earnings.service.js.map
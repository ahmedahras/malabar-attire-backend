"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockSettlementForRto = exports.processEligibleSettlements = exports.markOrderSettlementPendingIfEligible = void 0;
const pool_1 = require("../db/pool");
const ledger_service_1 = require("./ledger.service");
const logger_1 = require("../utils/logger");
const HOLD_DAYS = 7;
const markOrderSettlementPendingIfEligible = async (orderId) => {
    const result = await pool_1.db.query(`UPDATE orders o
     SET settlement_eligible_at = NOW() + ($2 || ' days')::interval,
         settlement_status = 'PENDING',
         updated_at = NOW()
     WHERE o.id = $1
       AND COALESCE(o.is_rto, FALSE) = FALSE
       AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
       AND NOT EXISTS (
         SELECT 1
         FROM order_shipments os
         WHERE os.order_id = o.id
           AND COALESCE(os.shipment_status, 'PROCESSING') <> 'DELIVERED'
       )`, [orderId, HOLD_DAYS]);
    return { updated: (result.rowCount ?? 0) > 0 };
};
exports.markOrderSettlementPendingIfEligible = markOrderSettlementPendingIfEligible;
const computeSellerPayoutShares = async (orderId) => {
    const meta = await pool_1.db.query(`SELECT o.payment_status,
            o.is_rto
     FROM orders o
     WHERE o.id = $1`, [orderId]);
    const order = meta.rows[0];
    if (!order)
        return null;
    if (String(order.payment_status ?? "").toLowerCase() !== "paid")
        return null;
    if (Boolean(order.is_rto))
        return null;
    const sellerRows = await pool_1.db.query(`SELECT s.owner_user_id AS seller_id,
            COALESCE(SUM(oi.total_price), 0)::numeric AS item_total
     FROM order_items oi
     INNER JOIN products p ON p.id = oi.product_id
     INNER JOIN shops s ON s.id = p.shop_id
     WHERE oi.order_id = $1
     GROUP BY s.owner_user_id`, [orderId]);
    const shares = sellerRows.rows.map((row) => {
        const itemTotal = Number(row.item_total ?? 0);
        const sellerShare = Number(itemTotal.toFixed(2));
        return {
            sellerId: row.seller_id,
            amount: sellerShare > 0 ? sellerShare : 0
        };
    });
    return shares;
};
const processEligibleSettlements = async () => {
    const eligibleOrders = await pool_1.db.query(`SELECT id
     FROM orders
     WHERE settlement_status = 'PENDING'
       AND settlement_eligible_at IS NOT NULL
       AND settlement_eligible_at <= NOW()
       AND COALESCE(is_rto, FALSE) = FALSE
       AND LOWER(COALESCE(payment_status, '')) = 'paid'
     ORDER BY settlement_eligible_at ASC
     LIMIT 500`);
    let processed = 0;
    let credited = 0;
    for (const row of eligibleOrders.rows) {
        const orderId = row.id;
        try {
            const shares = await computeSellerPayoutShares(orderId);
            if (!shares) {
                continue;
            }
            for (const share of shares) {
                if (share.amount <= 0)
                    continue;
                const ledgerResult = await (0, ledger_service_1.insertLedgerEntryIdempotent)({
                    sellerId: share.sellerId,
                    orderId,
                    amount: share.amount,
                    type: "CREDIT",
                    reason: "Order Delivered"
                });
                if (ledgerResult.inserted) {
                    credited += 1;
                }
            }
            await pool_1.db.query(`UPDATE orders
         SET settlement_status = 'ELIGIBLE',
             updated_at = NOW()
         WHERE id = $1
           AND settlement_status = 'PENDING'`, [orderId]);
            processed += 1;
        }
        catch (error) {
            logger_1.logger.error({ err: error, orderId }, "Settlement processing failed");
        }
    }
    return {
        scanned: eligibleOrders.rows.length,
        processed,
        credited
    };
};
exports.processEligibleSettlements = processEligibleSettlements;
const blockSettlementForRto = async (orderId) => {
    await pool_1.db.query(`UPDATE orders
     SET settlement_status = 'RTO_BLOCKED',
         updated_at = NOW()
     WHERE id = $1`, [orderId]);
};
exports.blockSettlementForRto = blockSettlementForRto;
//# sourceMappingURL=settlement.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyPayoutHistory = exports.getMyLedgerHistory = exports.getMyEarningsSummary = void 0;
const zod_1 = require("zod");
const pagination_1 = require("../../utils/pagination");
const earnings_service_1 = require("./earnings.service");
const paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().default(20)
});
const getSellerIdFromRequest = (req) => {
    if (!req.user) {
        return null;
    }
    return req.user.sub;
};
const getMyEarningsSummary = async (req, res) => {
    const sellerId = getSellerIdFromRequest(req);
    if (!sellerId) {
        return res.status(401).json({ error: "Missing token" });
    }
    const summary = await (0, earnings_service_1.getEarningsSummary)(sellerId);
    return res.json({
        total_earned: summary.totalEarned,
        available_for_payout: summary.availableForPayout,
        in_hold: summary.inHold,
        already_paid: summary.alreadyPaid,
        rto_deductions: summary.rtoDeductions
    });
};
exports.getMyEarningsSummary = getMyEarningsSummary;
const getMyLedgerHistory = async (req, res) => {
    const sellerId = getSellerIdFromRequest(req);
    if (!sellerId) {
        return res.status(401).json({ error: "Missing token" });
    }
    const parsed = paginationSchema.parse(req.query ?? {});
    const pagination = (0, pagination_1.parsePagination)({
        page: parsed.page,
        limit: parsed.limit,
        defaultLimit: 20,
        maxLimit: 100
    });
    const result = await (0, earnings_service_1.getLedgerHistory)(sellerId, pagination.limit, pagination.offset);
    return res.json({
        items: result.items,
        total: result.total,
        limit: pagination.limit,
        offset: pagination.offset
    });
};
exports.getMyLedgerHistory = getMyLedgerHistory;
const getMyPayoutHistory = async (req, res) => {
    const sellerId = getSellerIdFromRequest(req);
    if (!sellerId) {
        return res.status(401).json({ error: "Missing token" });
    }
    const parsed = paginationSchema.parse(req.query ?? {});
    const pagination = (0, pagination_1.parsePagination)({
        page: parsed.page,
        limit: parsed.limit,
        defaultLimit: 10,
        maxLimit: 100
    });
    const result = await (0, earnings_service_1.getPayoutHistory)(sellerId, pagination.limit, pagination.offset);
    return res.json({
        items: result.items,
        total: result.total,
        limit: pagination.limit,
        offset: pagination.offset
    });
};
exports.getMyPayoutHistory = getMyPayoutHistory;
//# sourceMappingURL=earnings.controller.js.map
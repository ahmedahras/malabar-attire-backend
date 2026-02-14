"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayoutBatchStats = exports.patchPayoutBatchStatus = exports.createPayoutBatch = exports.getPayoutBatchById = exports.listPayoutBatches = void 0;
const zod_1 = require("zod");
const pagination_1 = require("../utils/pagination");
const adminPayout_service_1 = require("../services/adminPayout.service");
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().default(20),
    status: zod_1.z.enum(["PENDING", "PROCESSING", "PAID"]).optional()
});
const payoutParamsSchema = zod_1.z.object({
    payoutId: zod_1.z.string().uuid()
});
const payoutStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(["PROCESSING", "PAID"])
});
const createPayoutSchema = zod_1.z.object({
    seller_id: zod_1.z.string().uuid(),
    seller_payout_amount: zod_1.z.coerce.number().positive()
});
const listPayoutBatches = async (req, res) => {
    const query = listQuerySchema.parse(req.query ?? {});
    const pagination = (0, pagination_1.parsePagination)({
        page: query.page,
        limit: query.limit,
        defaultLimit: 20,
        maxLimit: 100
    });
    const data = await (0, adminPayout_service_1.listAdminPayouts)({
        limit: pagination.limit,
        offset: pagination.offset,
        status: query.status
    });
    return res.json({
        items: data.items,
        total: data.total,
        limit: pagination.limit,
        offset: pagination.offset
    });
};
exports.listPayoutBatches = listPayoutBatches;
const getPayoutBatchById = async (req, res) => {
    const { payoutId } = payoutParamsSchema.parse(req.params);
    const details = await (0, adminPayout_service_1.getAdminPayoutDetails)(payoutId);
    if (!details) {
        return res.status(404).json({ error: "Payout not found" });
    }
    return res.json(details);
};
exports.getPayoutBatchById = getPayoutBatchById;
const createPayoutBatch = async (req, res) => {
    const body = createPayoutSchema.parse(req.body ?? {});
    if (!req.user?.sub) {
        return res.status(401).json({ error: "Missing token" });
    }
    const result = await (0, adminPayout_service_1.createAdminPayoutBatch)({
        sellerId: body.seller_id,
        payoutAmount: body.seller_payout_amount,
        createdBy: req.user.sub
    });
    if (!result.ok && result.reason === "invalid_amount") {
        return res.status(400).json({ error: "Invalid payout amount" });
    }
    if (!result.ok && result.reason === "seller_not_found") {
        return res.status(404).json({ error: "Seller not found" });
    }
    if (!result.ok && result.reason === "insufficient_balance") {
        return res.status(400).json({
            error: "seller_payout_amount exceeds seller available balance",
            available_balance: result.availableBalance
        });
    }
    if (!result.ok && result.reason === "invalid_margin") {
        return res.status(400).json({ error: "Invalid payout margin calculation" });
    }
    if (!result.ok) {
        return res.status(500).json({ error: "Unable to create payout batch" });
    }
    return res.status(201).json({
        payout_id: result.payoutId,
        seller_id: result.sellerId,
        total_amount: result.totalAmount,
        platform_margin: result.margin,
        status: result.status
    });
};
exports.createPayoutBatch = createPayoutBatch;
const patchPayoutBatchStatus = async (req, res) => {
    const { payoutId } = payoutParamsSchema.parse(req.params);
    const body = payoutStatusSchema.parse(req.body ?? {});
    if (!req.user?.sub) {
        return res.status(401).json({ error: "Missing token" });
    }
    const result = await (0, adminPayout_service_1.updateAdminPayoutStatus)({
        payoutId,
        newStatus: body.status,
        changedBy: req.user.sub
    });
    if (!result.ok && result.reason === "not_found") {
        return res.status(404).json({ error: "Payout not found" });
    }
    if (!result.ok && result.reason === "invalid_transition") {
        return res.status(400).json({
            error: "Invalid payout status transition",
            current_status: result.currentStatus
        });
    }
    return res.json({
        payout_id: payoutId,
        previous_status: result.previousStatus,
        status: result.status
    });
};
exports.patchPayoutBatchStatus = patchPayoutBatchStatus;
const getPayoutBatchStats = async (_req, res) => {
    const stats = await (0, adminPayout_service_1.getAdminPayoutStats)();
    return res.json(stats);
};
exports.getPayoutBatchStats = getPayoutBatchStats;
//# sourceMappingURL=adminPayout.controller.js.map
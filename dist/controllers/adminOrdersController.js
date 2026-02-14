"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderDetailForAdmin = exports.listOrdersForAdmin = void 0;
const zod_1 = require("zod");
const ordersService_1 = require("../services/ordersService");
const querySchema = zod_1.z.object({
    page: zod_1.z.string().optional(),
    limit: zod_1.z.string().optional(),
    status: zod_1.z
        .enum([
        "CREATED",
        "PAID",
        "PAYMENT_STOCK_FAILED",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED"
    ])
        .optional(),
    fromDate: zod_1.z.string().datetime().optional(),
    toDate: zod_1.z.string().datetime().optional(),
    sellerId: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().trim().min(1).max(64).optional()
});
const paramsSchema = zod_1.z.object({
    orderId: zod_1.z.string().uuid()
});
const parsePositiveNumber = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};
const listOrdersForAdmin = async (req, res) => {
    const query = querySchema.parse(req.query);
    const page = parsePositiveNumber(query.page, 1);
    const limit = Math.min(parsePositiveNumber(query.limit, 20), 100);
    const { data, pagination } = await (0, ordersService_1.getOrdersForAdmin)({
        status: query.status,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        sellerId: query.sellerId,
        customerId: query.customerId,
        search: query.search?.trim()
    }, { page, limit });
    return res.json({ data, pagination });
};
exports.listOrdersForAdmin = listOrdersForAdmin;
const getOrderDetailForAdmin = async (req, res) => {
    const { orderId } = paramsSchema.parse(req.params);
    const detail = await (0, ordersService_1.getAdminOrderDetail)(orderId);
    if (!detail) {
        return res.status(404).json({ error: "Order not found" });
    }
    return res.json(detail);
};
exports.getOrderDetailForAdmin = getOrderDetailForAdmin;
//# sourceMappingURL=adminOrdersController.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefundsHandler = exports.getLowStockHandler = exports.getTopProductsHandler = exports.getSalesTrendHandler = exports.getSummary = void 0;
const sellerDashboard_service_1 = require("./sellerDashboard.service");
const sellers_service_1 = require("../sellers/sellers.service");
const cache_1 = require("../../utils/cache");
const getShopIdForSeller = async (userId) => {
    const shop = await (0, sellers_service_1.getShopByOwner)(userId);
    return shop?.id ?? null;
};
const getSummary = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopId = await getShopIdForSeller(req.user.sub);
    if (!shopId) {
        return res.status(404).json({ error: "Shop not found" });
    }
    const cacheKey = `cache:dashboard:summary:${shopId}`;
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const summary = await (0, sellerDashboard_service_1.getDashboardSummary)(shopId, req.user.sub);
    await (0, cache_1.setCache)(cacheKey, summary, 30);
    return res.json(summary);
};
exports.getSummary = getSummary;
const getSalesTrendHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopId = await getShopIdForSeller(req.user.sub);
    if (!shopId) {
        return res.status(404).json({ error: "Shop not found" });
    }
    const statusParam = String(req.query.status ?? "PAID").toUpperCase();
    const status = statusParam === "DELIVERED" || statusParam === "ALL" ? statusParam : "PAID";
    const cacheKey = `cache:dashboard:sales-trend:${shopId}:${status}`;
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const trend = await (0, sellerDashboard_service_1.getSalesTrend)(shopId, status);
    const response = { items: trend };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getSalesTrendHandler = getSalesTrendHandler;
const getTopProductsHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopId = await getShopIdForSeller(req.user.sub);
    if (!shopId) {
        return res.status(404).json({ error: "Shop not found" });
    }
    const statusParam = String(req.query.status ?? "PAID").toUpperCase();
    const status = statusParam === "DELIVERED" || statusParam === "ALL" ? statusParam : "PAID";
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const cacheKey = `cache:dashboard:top-products:${shopId}:${status}:${limit}:${offset}`;
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const items = await (0, sellerDashboard_service_1.getTopProducts)(shopId, status, limit, offset);
    const response = { items };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getTopProductsHandler = getTopProductsHandler;
const getLowStockHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopId = await getShopIdForSeller(req.user.sub);
    if (!shopId) {
        return res.status(404).json({ error: "Shop not found" });
    }
    const items = await (0, sellerDashboard_service_1.getLowStockProducts)(shopId);
    return res.json({ items });
};
exports.getLowStockHandler = getLowStockHandler;
const getRefundsHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopId = await getShopIdForSeller(req.user.sub);
    if (!shopId) {
        return res.status(404).json({ error: "Shop not found" });
    }
    const summary = await (0, sellerDashboard_service_1.getRefundsSummary)(shopId);
    return res.json(summary);
};
exports.getRefundsHandler = getRefundsHandler;
//# sourceMappingURL=sellerDashboard.controller.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerDashboardRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const rateLimiter_1 = require("../../middleware/rateLimiter");
const sellerDashboard_controller_1 = require("./sellerDashboard.controller");
exports.sellerDashboardRouter = (0, express_1.Router)();
exports.sellerDashboardRouter.get("/summary", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellerDashboard_controller_1.getSummary);
exports.sellerDashboardRouter.get("/sales-trend", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellerDashboard_controller_1.getSalesTrendHandler);
exports.sellerDashboardRouter.get("/top-products", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellerDashboard_controller_1.getTopProductsHandler);
exports.sellerDashboardRouter.get("/low-stock", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellerDashboard_controller_1.getLowStockHandler);
exports.sellerDashboardRouter.get("/refunds", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellerDashboard_controller_1.getRefundsHandler);
//# sourceMappingURL=sellerDashboard.routes.js.map
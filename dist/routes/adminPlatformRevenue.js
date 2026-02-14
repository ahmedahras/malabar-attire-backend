"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPlatformRevenueRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const adminPlatformRevenue_controller_1 = require("../controllers/adminPlatformRevenue.controller");
const adminPlatformRevenueExport_controller_1 = require("../controllers/adminPlatformRevenueExport.controller");
exports.adminPlatformRevenueRouter = (0, express_1.Router)();
exports.adminPlatformRevenueRouter.get("/platform/revenue", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPlatformRevenue_controller_1.getAdminPlatformRevenue);
exports.adminPlatformRevenueRouter.get("/platform/revenue/by-seller", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPlatformRevenue_controller_1.getAdminPlatformRevenueBySeller);
exports.adminPlatformRevenueRouter.get("/platform/revenue/export", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPlatformRevenueExport_controller_1.exportAdminPlatformRevenueCsv);
exports.adminPlatformRevenueRouter.get("/platform/revenue/gst", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPlatformRevenueExport_controller_1.getAdminPlatformRevenueGstReport);
//# sourceMappingURL=adminPlatformRevenue.js.map
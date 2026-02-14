"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminPlatformRevenueBySeller = exports.getAdminPlatformRevenue = void 0;
const adminPayout_service_1 = require("../services/adminPayout.service");
const getAdminPlatformRevenue = async (_req, res) => {
    const summary = await (0, adminPayout_service_1.getPlatformRevenueSummary)();
    return res.json(summary);
};
exports.getAdminPlatformRevenue = getAdminPlatformRevenue;
const getAdminPlatformRevenueBySeller = async (_req, res) => {
    const items = await (0, adminPayout_service_1.getPlatformRevenueBySeller)();
    return res.json(items);
};
exports.getAdminPlatformRevenueBySeller = getAdminPlatformRevenueBySeller;
//# sourceMappingURL=adminPlatformRevenue.controller.js.map
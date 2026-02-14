"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerEarningsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const rateLimiter_1 = require("../../middleware/rateLimiter");
const earnings_controller_1 = require("./earnings.controller");
exports.sellerEarningsRouter = (0, express_1.Router)();
exports.sellerEarningsRouter.get("/earnings", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), earnings_controller_1.getMyEarningsSummary);
exports.sellerEarningsRouter.get("/earnings/ledger", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), earnings_controller_1.getMyLedgerHistory);
exports.sellerEarningsRouter.get("/payouts", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), earnings_controller_1.getMyPayoutHistory);
//# sourceMappingURL=sellerEarnings.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPayoutsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const adminPayout_controller_1 = require("../controllers/adminPayout.controller");
exports.adminPayoutsRouter = (0, express_1.Router)();
exports.adminPayoutsRouter.get("/payouts/stats", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPayout_controller_1.getPayoutBatchStats);
exports.adminPayoutsRouter.get("/payouts", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPayout_controller_1.listPayoutBatches);
exports.adminPayoutsRouter.post("/payouts", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPayout_controller_1.createPayoutBatch);
exports.adminPayoutsRouter.get("/payouts/:payoutId", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPayout_controller_1.getPayoutBatchById);
exports.adminPayoutsRouter.patch("/payouts/:payoutId/status", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), adminPayout_controller_1.patchPayoutBatchStatus);
//# sourceMappingURL=adminPayouts.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSellerApplicationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const sellerApplicationsController_1 = require("../controllers/sellerApplicationsController");
exports.adminSellerApplicationsRouter = (0, express_1.Router)();
exports.adminSellerApplicationsRouter.get("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), sellerApplicationsController_1.listSellerApplicationsAdmin);
exports.adminSellerApplicationsRouter.patch("/:id/approve", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), sellerApplicationsController_1.approveSellerApplication);
exports.adminSellerApplicationsRouter.patch("/:id/reject", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), sellerApplicationsController_1.rejectSellerApplication);
//# sourceMappingURL=adminSellerApplications.js.map
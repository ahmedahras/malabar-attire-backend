"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerApplicationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const sellerApplicationsController_1 = require("../controllers/sellerApplicationsController");
exports.sellerApplicationsRouter = (0, express_1.Router)();
exports.sellerApplicationsRouter.post("/apply", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, sellerApplicationsController_1.applySeller);
//# sourceMappingURL=sellerApplications.js.map
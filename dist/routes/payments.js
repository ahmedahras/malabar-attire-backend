"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const authorization_1 = require("../middleware/authorization");
const paymentsController_1 = require("../controllers/paymentsController");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.paymentsRouter = (0, express_1.Router)();
exports.paymentsRouter.post("/intent", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("customer"), (0, authorization_1.requireOrderAccess)("orderId"), paymentsController_1.createPaymentIntent);
//# sourceMappingURL=payments.js.map
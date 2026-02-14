"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const returnsController_1 = require("../controllers/returnsController");
const returns_1 = require("../middleware/returns");
const authorization_1 = require("../middleware/authorization");
exports.returnsRouter = (0, express_1.Router)();
exports.returnsRouter.post("/", auth_1.requireAuth, rateLimiter_1.rateLimitOrdersRefunds, (0, auth_1.requireRole)("customer"), returns_1.requireDeliveredOrderForReturn, returnsController_1.createReturnRequest);
exports.returnsRouter.post("/:id/seller-review", auth_1.requireAuth, rateLimiter_1.rateLimitOrdersRefunds, (0, auth_1.requireRole)("shop_owner"), (0, authorization_1.requireReturnAccess)(), returnsController_1.sellerReviewReturn);
exports.returnsRouter.post("/:id/mark-received", auth_1.requireAuth, rateLimiter_1.rateLimitOrdersRefunds, (0, auth_1.requireRole)("shop_owner"), (0, authorization_1.requireReturnAccess)(), returnsController_1.markReturnReceived);
exports.returnsRouter.post("/:id/refund", auth_1.requireAuth, rateLimiter_1.rateLimitOrdersRefunds, (0, auth_1.requireRole)("admin"), (0, authorization_1.requireRefundPermission)(), (0, authorization_1.requireReturnAccess)(), returnsController_1.refundReturn);
exports.returnsRouter.post("/:id/dispute", auth_1.requireAuth, rateLimiter_1.rateLimitOrdersRefunds, (0, auth_1.requireRole)("customer"), (0, authorization_1.requireReturnAccess)(), returnsController_1.disputeReturn);
//# sourceMappingURL=returns.js.map
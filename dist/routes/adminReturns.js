"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminReturnsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const adminReturnsController_1 = require("../controllers/adminReturnsController");
const authorization_1 = require("../middleware/authorization");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.adminReturnsRouter = (0, express_1.Router)();
exports.adminReturnsRouter.post("/returns/:id/review", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), (0, authorization_1.requireReturnAccess)(), adminReturnsController_1.adminReviewReturn);
//# sourceMappingURL=adminReturns.js.map
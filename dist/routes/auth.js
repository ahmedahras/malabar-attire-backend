"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/register", rateLimiter_1.rateLimitPublic, authController_1.register);
exports.authRouter.post("/login", rateLimiter_1.rateLimitPublic, authController_1.login);
//# sourceMappingURL=auth.js.map
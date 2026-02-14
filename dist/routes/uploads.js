"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const uploadsController_1 = require("../controllers/uploadsController");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.uploadsRouter = (0, express_1.Router)();
exports.uploadsRouter.post("/presign", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), uploadsController_1.createUploadPresign);
//# sourceMappingURL=uploads.js.map
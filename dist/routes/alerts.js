"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const alertsController_1 = require("../controllers/alertsController");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.alertsRouter = (0, express_1.Router)();
exports.alertsRouter.get("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), alertsController_1.listAlerts);
exports.alertsRouter.patch("/:id/resolve", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), alertsController_1.resolveAlert);
//# sourceMappingURL=alerts.js.map
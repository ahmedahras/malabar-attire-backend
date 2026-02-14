"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const rateLimiter_1 = require("../../middleware/rateLimiter");
const notification_controller_1 = require("./notification.controller");
exports.notificationsRouter = (0, express_1.Router)();
exports.notificationsRouter.get("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.getNotifications);
exports.notificationsRouter.get("/unread-count", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.getUnreadCountHandler);
exports.notificationsRouter.get("/preferences", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.getPreferencesHandler);
exports.notificationsRouter.patch("/:id/read", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.markRead);
exports.notificationsRouter.patch("/mark-all-read", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.markAllRead);
exports.notificationsRouter.patch("/preferences", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, notification_controller_1.updatePreferencesHandler);
//# sourceMappingURL=notification.routes.js.map
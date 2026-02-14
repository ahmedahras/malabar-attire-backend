"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reservationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const reservation_controller_1 = require("./reservation.controller");
const rateLimiter_1 = require("../../middleware/rateLimiter");
exports.reservationsRouter = (0, express_1.Router)();
exports.reservationsRouter.post("/convert", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, reservation_controller_1.convertReservationHandler);
//# sourceMappingURL=reservation.routes.js.map
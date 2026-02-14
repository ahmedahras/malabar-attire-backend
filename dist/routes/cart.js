"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const reservation_controller_1 = require("../modules/reservations/reservation.controller");
const rateLimiter_1 = require("../middleware/rateLimiter");
const cart_controller_1 = require("../controllers/cart.controller");
exports.cartRouter = (0, express_1.Router)();
exports.cartRouter.get("/active", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, cart_controller_1.getActiveCart);
exports.cartRouter.post("/reserve", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, reservation_controller_1.reserveCartItem);
//# sourceMappingURL=cart.js.map
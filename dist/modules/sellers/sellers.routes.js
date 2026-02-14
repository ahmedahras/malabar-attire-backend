"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellersRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const sellers_controller_1 = require("./sellers.controller");
const rateLimiter_1 = require("../../middleware/rateLimiter");
const sellerEarnings_routes_1 = require("./sellerEarnings.routes");
exports.sellersRouter = (0, express_1.Router)();
exports.sellersRouter.post("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellers_controller_1.createShop);
exports.sellersRouter.use("/me", sellerEarnings_routes_1.sellerEarningsRouter);
exports.sellersRouter.get("/me", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellers_controller_1.getMyShop);
exports.sellersRouter.put("/me/pickup-address", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), sellers_controller_1.updateMyPickupAddress);
exports.sellersRouter.get("/:id/quality", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), sellers_controller_1.getSellerQuality);
//# sourceMappingURL=sellers.routes.js.map
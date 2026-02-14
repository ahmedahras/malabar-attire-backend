"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminProductsRouter = void 0;
const express_1 = require("express");
const productsController_1 = require("../controllers/productsController");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.adminProductsRouter = (0, express_1.Router)();
exports.adminProductsRouter.get("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), productsController_1.listAdminProducts);
exports.adminProductsRouter.delete("/:id", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("admin"), productsController_1.adminDeleteProduct);
//# sourceMappingURL=adminProducts.js.map
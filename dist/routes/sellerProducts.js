"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerProductsRouter = void 0;
const express_1 = require("express");
const productsController_1 = require("../controllers/productsController");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const categoryValidation_1 = require("../middleware/categoryValidation");
exports.sellerProductsRouter = (0, express_1.Router)();
exports.sellerProductsRouter.post("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), categoryValidation_1.validateKidsCategorySelection, productsController_1.createProduct);
exports.sellerProductsRouter.get("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), productsController_1.listSellerProducts);
exports.sellerProductsRouter.put("/:id", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), categoryValidation_1.validateKidsCategorySelection, productsController_1.updateSellerProduct);
//# sourceMappingURL=sellerProducts.js.map
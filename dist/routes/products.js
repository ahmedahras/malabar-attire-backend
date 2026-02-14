"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRouter = void 0;
const express_1 = require("express");
const productsController_1 = require("../controllers/productsController");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const categoryValidation_1 = require("../middleware/categoryValidation");
exports.productsRouter = (0, express_1.Router)();
exports.productsRouter.post("/", auth_1.requireAuth, rateLimiter_1.rateLimitProtected, (0, auth_1.requireRole)("shop_owner"), categoryValidation_1.validateKidsCategorySelection, productsController_1.createProduct);
exports.productsRouter.get("/categories", rateLimiter_1.rateLimitPublic, productsController_1.listProductCategories);
exports.productsRouter.get("/", rateLimiter_1.rateLimitPublic, productsController_1.listProducts);
exports.productsRouter.get("/:id", rateLimiter_1.rateLimitPublic, productsController_1.getProductById);
exports.productsRouter.get("/:id/variants", rateLimiter_1.rateLimitPublic, productsController_1.getProductVariants);
exports.productsRouter.get("/:id/similar", rateLimiter_1.rateLimitPublic, productsController_1.getSimilarProducts);
//# sourceMappingURL=products.js.map
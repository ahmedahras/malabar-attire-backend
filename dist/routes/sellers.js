"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellersRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const sellerController_1 = require("../controllers/sellerController");
exports.sellersRouter = (0, express_1.Router)();
exports.sellersRouter.get("/:id/quality", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), sellerController_1.getSellerQuality);
//# sourceMappingURL=sellers.js.map
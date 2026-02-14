"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhooksRouter = void 0;
const express_1 = require("express");
const webhooksController_1 = require("../controllers/webhooksController");
const shiprocketWebhook_controller_1 = require("../controllers/shiprocketWebhook.controller");
const rateLimiter_1 = require("../middleware/rateLimiter");
exports.webhooksRouter = (0, express_1.Router)();
exports.webhooksRouter.post("/razorpay", rateLimiter_1.rateLimitWebhooks, webhooksController_1.handleRazorpayWebhook);
exports.webhooksRouter.post("/shiprocket", rateLimiter_1.rateLimitWebhooks, shiprocketWebhook_controller_1.handleShiprocketWebhookSync);
//# sourceMappingURL=webhooks.js.map
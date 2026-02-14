"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const auth_1 = require("./auth");
const health_1 = require("./health");
const products_1 = require("./products");
const returns_1 = require("./returns");
const admin_1 = require("./admin");
const metrics_1 = require("./metrics");
const orders_1 = require("./orders");
const webhooks_1 = require("./webhooks");
const payments_1 = require("./payments");
const finance_1 = require("./finance");
const alerts_1 = require("./alerts");
const sellers_routes_1 = require("../modules/sellers/sellers.routes");
const cart_1 = require("./cart");
const reservation_routes_1 = require("../modules/reservations/reservation.routes");
const sellerDashboard_routes_1 = require("../modules/sellerDashboard/sellerDashboard.routes");
const notification_routes_1 = require("../modules/notifications/notification.routes");
const uploads_1 = require("./uploads");
const sellerProducts_1 = require("./sellerProducts");
const adminProducts_1 = require("./adminProducts");
const sellerApplications_1 = require("./sellerApplications");
const adminSellerApplications_1 = require("./adminSellerApplications");
exports.apiRouter = (0, express_1.Router)();
// 🔐 Auth & Health
exports.apiRouter.use("/auth", auth_1.authRouter);
exports.apiRouter.use("/health", health_1.healthRouter);
// 🛍 Products & Orders
exports.apiRouter.use("/products", products_1.productsRouter);
exports.apiRouter.use("/orders", orders_1.ordersRouter);
exports.apiRouter.use("/cart", cart_1.cartRouter);
// 💳 Payments
exports.apiRouter.use("/payments", payments_1.paymentsRouter);
// 📦 Returns & Finance
exports.apiRouter.use("/returns", returns_1.returnsRouter);
exports.apiRouter.use("/finance", finance_1.financeRouter);
exports.apiRouter.use("/finance/alerts", alerts_1.alertsRouter);
// 🧑‍💼 Admin
exports.apiRouter.use("/admin", admin_1.adminRouter);
exports.apiRouter.use("/admin/products", adminProducts_1.adminProductsRouter);
exports.apiRouter.use("/admin/seller-applications", adminSellerApplications_1.adminSellerApplicationsRouter);
// 🧑‍💻 Sellers
exports.apiRouter.use("/sellers", sellers_routes_1.sellersRouter);
exports.apiRouter.use("/seller", sellerApplications_1.sellerApplicationsRouter);
exports.apiRouter.use("/seller/products", sellerProducts_1.sellerProductsRouter);
exports.apiRouter.use("/seller/dashboard", sellerDashboard_routes_1.sellerDashboardRouter);
// 📊 Metrics & Notifications
exports.apiRouter.use("/metrics", metrics_1.metricsRouter);
exports.apiRouter.use("/notifications", notification_routes_1.notificationsRouter);
// 📂 Uploads & Webhooks
exports.apiRouter.use("/uploads", uploads_1.uploadsRouter);
exports.apiRouter.use("/webhooks", webhooks_1.webhooksRouter);
// 📅 Reservations
exports.apiRouter.use("/reservations", reservation_routes_1.reservationsRouter);
//# sourceMappingURL=index.js.map
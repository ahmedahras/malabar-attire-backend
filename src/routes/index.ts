import { Router } from "express";

import { authRouter } from "./auth";
import { healthRouter } from "./health";
import { productsRouter } from "./products";
import { returnsRouter } from "./returns";
import { adminRouter } from "./admin";
import { metricsRouter } from "./metrics";
import { ordersRouter } from "./orders";
import { webhooksRouter } from "./webhooks";
import { paymentsRouter } from "./payments";
import { financeRouter } from "./finance";
import { alertsRouter } from "./alerts";
import { sellersRouter } from "../modules/sellers/sellers.routes";
import { cartRouter } from "./cart";
import { reservationsRouter } from "../modules/reservations/reservation.routes";
import { sellerDashboardRouter } from "../modules/sellerDashboard/sellerDashboard.routes";
import { notificationsRouter } from "../modules/notifications/notification.routes";
import { uploadsRouter } from "./uploads";
import { sellerProductsRouter } from "./sellerProducts";
import { adminProductsRouter } from "./adminProducts";
import { sellerApplicationsRouter } from "./sellerApplications";
import { adminSellerApplicationsRouter } from "./adminSellerApplications";

export const apiRouter = Router();

// 🔐 Auth & Health
apiRouter.use("/auth", authRouter);
apiRouter.use("/health", healthRouter);

// 🛍 Products & Orders
apiRouter.use("/products", productsRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/cart", cartRouter);

// 💳 Payments
apiRouter.use("/payments", paymentsRouter);

// 📦 Returns & Finance
apiRouter.use("/returns", returnsRouter);
apiRouter.use("/finance", financeRouter);
apiRouter.use("/finance/alerts", alertsRouter);

// 🧑‍💼 Admin
apiRouter.use("/admin", adminRouter);
apiRouter.use("/admin/products", adminProductsRouter);
apiRouter.use("/admin/seller-applications", adminSellerApplicationsRouter);

// 🧑‍💻 Sellers
apiRouter.use("/sellers", sellersRouter);
apiRouter.use("/seller", sellerApplicationsRouter);
apiRouter.use("/seller/products", sellerProductsRouter);
apiRouter.use("/seller/dashboard", sellerDashboardRouter);

// 📊 Metrics & Notifications
apiRouter.use("/metrics", metricsRouter);
apiRouter.use("/notifications", notificationsRouter);

// 📂 Uploads & Webhooks
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/webhooks", webhooksRouter);

// 📅 Reservations
apiRouter.use("/reservations", reservationsRouter);


"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const routes_1 = require("./routes");
const error_1 = require("./middleware/error");
const logger_1 = require("./utils/logger");
const createApp = () => {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            const isDev = process.env.NODE_ENV !== "production";
            if (isDev) {
                callback(null, true);
                return;
            }
            const allowed = [
                process.env.FRONTEND_URL,
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001"
            ];
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: false
    }));
    app.use(express_1.default.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
            const url = req.originalUrl ??
                req.url;
            if (url === "/api/webhooks/razorpay" ||
                url === "/api/webhooks/shiprocket") {
                req.rawBody = buf;
            }
        }
    }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
    // 🔥 MAIN API ROUTER
    app.use("/api", routes_1.apiRouter);
    app.use(error_1.notFoundHandler);
    app.use(error_1.errorHandler);
    return app;
};
exports.createApp = createApp;
//# sourceMappingURL=app.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config({
    path: path_1.default.resolve(__dirname, "..", "..", ".env"),
    override: true
});
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string(),
    REDIS_URL: zod_1.z.string().default("redis://localhost:6379"),
    JWT_SECRET: zod_1.z.string(),
    JWT_EXPIRES_IN: zod_1.z.string().default("7d"),
    JOBS_ENABLED: zod_1.z.coerce.boolean().default(true),
    ORDER_AUTO_CANCEL_MINUTES: zod_1.z.coerce.number().default(30),
    RETURN_WINDOW_DAYS: zod_1.z.coerce.number().default(7),
    DISPUTE_AUTO_CLOSE_DAYS: zod_1.z.coerce.number().default(5),
    RESERVATION_TTL_MINUTES: zod_1.z.coerce.number().default(15),
    PAYOUT_THRESHOLD: zod_1.z.coerce.number().default(1000),
    PAYOUT_SCHEDULE_HOURS: zod_1.z.coerce.number().default(24),
    FINANCE_MISMATCH_THRESHOLD: zod_1.z.coerce.number().default(1),
    FINANCE_REFUND_RATE_THRESHOLD: zod_1.z.coerce.number().default(0.2),
    NEGATIVE_BALANCE_LIMIT: zod_1.z.coerce.number().default(500),
    ADMIN_FINANCE_EMAIL: zod_1.z.string().optional(),
    FINANCE_SLACK_WEBHOOK_URL: zod_1.z.string().optional(),
    PAYOUTS_FROZEN: zod_1.z.coerce.boolean().default(false),
    HIGH_VALUE_ORDER_THRESHOLD: zod_1.z.coerce.number().default(100000),
    ADMIN_OVERRIDE_FINANCE_FREEZE: zod_1.z.coerce.boolean().default(false),
    RISK_SCORE_THRESHOLD: zod_1.z.coerce.number().default(60),
    RISK_SCORE_CRITICAL: zod_1.z.coerce.number().default(85),
    RISK_MODE_COOLDOWN_HOURS: zod_1.z.coerce.number().default(48),
    FRONTEND_URL: zod_1.z.string().optional(),
    RAZORPAY_KEY_ID: zod_1.z.string().optional(),
    RAZORPAY_KEY_SECRET: zod_1.z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: zod_1.z.string().optional(),
    FCM_SERVICE_ACCOUNT: zod_1.z.string().optional(),
    S3_BUCKET: zod_1.z.string().optional(),
    S3_REGION: zod_1.z.string().optional(),
    S3_ACCESS_KEY_ID: zod_1.z.string().optional(),
    S3_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    CDN_BASE_URL: zod_1.z.string().optional(),
    // Transactional emails
    EMAIL_PROVIDER: zod_1.z.string().default("noop"),
    EMAIL_PROVIDER_API_KEY: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.string().optional(),
    SHIPROCKET_EMAIL: zod_1.z.string().optional(),
    SHIPROCKET_PASSWORD: zod_1.z.string().optional(),
    SHIPROCKET_API_BASE: zod_1.z.string().default("https://apiv2.shiprocket.in/v1/external"),
    SHIPROCKET_WEBHOOK_SECRET: zod_1.z.string().optional(),
    ADMIN_REGISTER_KEY: zod_1.z.string().optional(),
    PLATFORM_GST_RATE: zod_1.z.coerce.number().default(18)
});
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map
import dotenv from "dotenv";
import path from "path";
import { z } from "zod";
import { databaseEnvHint, resolveDatabaseUrlFromEnv } from "./databaseUrl";

dotenv.config({
  path: path.resolve(__dirname, "..", "..", ".env"),
  override: false
});

const resolvedDatabaseUrl = resolveDatabaseUrlFromEnv();
if (resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, `DATABASE_URL is required. ${databaseEnvHint}`),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JOBS_ENABLED: z.coerce.boolean().default(true),
  ORDER_AUTO_CANCEL_MINUTES: z.coerce.number().default(30),
  RETURN_WINDOW_DAYS: z.coerce.number().default(7),
  DISPUTE_AUTO_CLOSE_DAYS: z.coerce.number().default(5),
  RESERVATION_TTL_MINUTES: z.coerce.number().default(15),
  PAYOUT_THRESHOLD: z.coerce.number().default(1000),
  PAYOUT_SCHEDULE_HOURS: z.coerce.number().default(24),
  FINANCE_MISMATCH_THRESHOLD: z.coerce.number().default(1),
  FINANCE_REFUND_RATE_THRESHOLD: z.coerce.number().default(0.2),
  NEGATIVE_BALANCE_LIMIT: z.coerce.number().default(500),
  ADMIN_FINANCE_EMAIL: z.string().optional(),
  FINANCE_SLACK_WEBHOOK_URL: z.string().optional(),
  PAYOUTS_FROZEN: z.coerce.boolean().default(false),
  HIGH_VALUE_ORDER_THRESHOLD: z.coerce.number().default(100000),
  ADMIN_OVERRIDE_FINANCE_FREEZE: z.coerce.boolean().default(false),
  RISK_SCORE_THRESHOLD: z.coerce.number().default(60),
  RISK_SCORE_CRITICAL: z.coerce.number().default(85),
  RISK_MODE_COOLDOWN_HOURS: z.coerce.number().default(48),
  FRONTEND_URL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  FCM_SERVICE_ACCOUNT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),

  // Transactional emails
  EMAIL_PROVIDER: z.string().default("noop"),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_API_BASE: z.string().default("https://apiv2.shiprocket.in/v1/external"),
  SHIPROCKET_WEBHOOK_SECRET: z.string().optional(),

  ADMIN_REGISTER_KEY: z.string().optional(),
  PLATFORM_GST_RATE: z.coerce.number().default(18)
});

export const env = envSchema.parse(process.env);

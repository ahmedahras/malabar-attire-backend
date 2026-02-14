"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitWebhooks = exports.rateLimitOrdersRefunds = exports.rateLimitProtected = exports.rateLimitPublic = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
let rateClient = null;
const getClient = () => {
    if (!rateClient) {
        rateClient = new ioredis_1.default(env_1.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            enableOfflineQueue: false,
            retryStrategy: (times) => Math.min(1000 * 2 ** (times - 1), 10000)
        });
        rateClient.on("ready", () => {
            logger_1.logger.info("[REDIS] Connected");
        });
        rateClient.on("reconnecting", () => {
            logger_1.logger.warn("[REDIS] Reconnecting...");
        });
        rateClient.on("error", (error) => {
            logger_1.logger.warn({ err: error }, "[REDIS] Client error");
        });
        rateClient.on("end", () => {
            logger_1.logger.warn("[REDIS] Offline — running in degraded mode");
        });
    }
    return rateClient;
};
const getIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0]?.trim() || req.ip;
    }
    return req.ip;
};
const createLimiter = (limit, keyFn) => {
    return async (req, res, next) => {
        const key = keyFn(req);
        try {
            const client = getClient();
            const count = await client.incr(key);
            if (count === 1) {
                await client.expire(key, 60);
            }
            if (count > limit) {
                return res.status(429).json({ error: "Rate limit exceeded" });
            }
            return next();
        }
        catch {
            return next();
        }
    };
};
exports.rateLimitPublic = createLimiter(60, (req) => {
    const ip = getIp(req);
    return `rl:public:${ip}`;
});
exports.rateLimitProtected = createLimiter(120, (req) => {
    const userId = req.user?.sub ?? getIp(req);
    return `rl:protected:${userId}`;
});
exports.rateLimitOrdersRefunds = createLimiter(10, (req) => {
    const userId = req.user?.sub ?? getIp(req);
    return `rl:orders:${userId}`;
});
exports.rateLimitWebhooks = createLimiter(60, (req) => {
    const ip = getIp(req);
    return `rl:webhooks:${ip}`;
});
//# sourceMappingURL=rateLimiter.js.map
import { NextFunction, Request, Response } from "express";
import IORedis from "ioredis";
import { env } from "../config/env";
import { logger } from "../utils/logger";

let rateClient: IORedis | null = null;

const getClient = () => {
  if (!rateClient) {
    rateClient = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(1000 * 2 ** (times - 1), 10_000)
    });
    rateClient.on("ready", () => {
      logger.info("[REDIS] Connected");
    });
    rateClient.on("reconnecting", () => {
      logger.warn("[REDIS] Reconnecting...");
    });
    rateClient.on("error", (error) => {
      logger.warn({ err: error }, "[REDIS] Client error");
    });
    rateClient.on("end", () => {
      logger.warn("[REDIS] Offline — running in degraded mode");
    });
  }
  return rateClient;
};

const getIp = (req: Request) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || req.ip;
  }
  return req.ip;
};

const createLimiter = (limit: number, keyFn: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
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
    } catch {
      return next();
    }
  };
};

export const rateLimitPublic = createLimiter(60, (req) => {
  const ip = getIp(req);
  return `rl:public:${ip}`;
});

export const rateLimitProtected = createLimiter(120, (req) => {
  const userId = req.user?.sub ?? getIp(req);
  return `rl:protected:${userId}`;
});

export const rateLimitOrdersRefunds = createLimiter(10, (req) => {
  const userId = req.user?.sub ?? getIp(req);
  return `rl:orders:${userId}`;
});

export const rateLimitWebhooks = createLimiter(60, (req) => {
  const ip = getIp(req);
  return `rl:webhooks:${ip}`;
});

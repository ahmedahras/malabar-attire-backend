import { NextFunction, Request, Response } from "express";
import { getRedisClient } from "../lib/redis";

const ensureClientReady = async () => {
  const rateClient = getRedisClient();
  if (!rateClient) {
    return null;
  }
  if (rateClient.status !== "ready") {
    try {
      await rateClient.connect();
    } catch {
      return null;
    }
  }
  if (rateClient.status !== "ready") {
    return null;
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
      const client = await ensureClientReady();
      if (!client) {
        return next();
      }
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

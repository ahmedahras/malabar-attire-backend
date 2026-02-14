import { createClient } from "redis";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export const cacheClient = createClient({
  url: env.REDIS_URL
});

cacheClient.on("error", (err) => {
  logger.error({ err }, "Redis error");
});

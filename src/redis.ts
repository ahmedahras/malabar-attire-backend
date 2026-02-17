import IORedis, { type RedisOptions } from "ioredis";

const redisUrl = process.env.REDIS_URL;
export const isRedisEnabled = process.env.REDIS_ENABLED === "true" && Boolean(redisUrl);

export type RedisClient = IORedis;

let loggedDisabled = false;
export let redis: RedisClient | null = null;

const logDisabledOnce = () => {
  if (loggedDisabled) return;
  loggedDisabled = true;
  console.log("[REDIS] Disabled");
};

const withDefaults = (options?: RedisOptions): RedisOptions => ({
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 3_000,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(1000 * 2 ** (times - 1), 10_000),
  ...(options ?? {})
});

const wireRedisEvents = (client: RedisClient) => {
  client.on("error", (error) => {
    console.warn("[REDIS] Client error", error);
  });
};

if (!isRedisEnabled || !redisUrl) {
  logDisabledOnce();
}

export const getRedisClient = (options?: RedisOptions): RedisClient | null => {
  if (!isRedisEnabled || !redisUrl) {
    logDisabledOnce();
    return null;
  }
  if (!redis) {
    redis = new IORedis(redisUrl, withDefaults(options));
    wireRedisEvents(redis);
  }
  return redis;
};

export const createRedisClient = (options?: RedisOptions): RedisClient | null => {
  if (!isRedisEnabled || !redisUrl) {
    logDisabledOnce();
    return null;
  }
  const client = new IORedis(redisUrl, withDefaults(options));
  wireRedisEvents(client);
  return client;
};


const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const client = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  enableOfflineQueue: false
});

const run = async () => {
  try {
    await client.connect();
    const key = "redis:smoke:test";
    await client.set(key, "ok", "EX", 60);
    const value = await client.get(key);
    const ttl = await client.ttl(key);
    console.log(`value=${value}`);
    console.log(`ttl=${ttl}`);
    await client.quit();
    if (value !== "ok" || ttl <= 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    try {
      await client.quit();
    } catch {
      // ignore
    }
    process.exit(1);
  }
};

run();

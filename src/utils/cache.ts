import IORedis from "ioredis";
import { env } from "../config/env";

let cacheClient: IORedis | null = null;
let hits = 0;
let misses = 0;
let lastDegradedLogAt = 0;

// L1: In-memory cache (per Node process)
const MAX_MEMORY_CACHE_SIZE = 500;
const memoryCache = new Map<string, {
  value: any;
  expiresAt: number;
  staleAt: number;
}>();

const isConnectionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return true;
  }
  const message = (error as { message?: string }).message ?? "";
  if (/ECONNREFUSED|ETIMEDOUT|Connection is closed|connect/i.test(message)) {
    return true;
  }
  const nested = (error as { errors?: unknown[] }).errors;
  if (Array.isArray(nested)) {
    return nested.some((entry) => isConnectionError(entry));
  }
  return false;
};

const logDegradedOncePerMinute = (error: unknown): void => {
  if (!isConnectionError(error)) {
    return;
  }
  const now = Date.now();
  if (now - lastDegradedLogAt < 60_000) {
    return;
  }
  lastDegradedLogAt = now;
  console.warn("[REDIS] Offline — running in degraded mode");
};

const getClient = (): IORedis => {
  if (!cacheClient) {
    console.log("[REDIS] Client initializing");
    cacheClient = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(1000 * 2 ** (times - 1), 10_000)
    });
    cacheClient.on("ready", () => {
      lastDegradedLogAt = 0;
      console.warn("[REDIS] Connected");
      console.log("[REDIS] Connected");
    });
    cacheClient.on("reconnecting", () => {
      console.warn("[REDIS] Reconnecting...");
    });
    cacheClient.on("error", (error) => {
      console.log("[REDIS] Connection error");
      logDegradedOncePerMinute(error);
    });
    cacheClient.on("end", () => {
      logDegradedOncePerMinute({ code: "ECONNREFUSED" });
    });
  }
  return cacheClient;
};

const ensureClientReady = async () => {
  const client = getClient();
  if (client.status !== "ready") {
    try {
      await client.connect();
    } catch (error) {
      logDegradedOncePerMinute(error);
      return null;
    }
  }
  if (client.status !== "ready") {
    logDegradedOncePerMinute({ code: "ECONNREFUSED" });
    return null;
  }
  return client;
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  console.log("[REDIS] getCache called");
  try {
    const client = await ensureClientReady();
    if (!client) {
      misses += 1;
      return null;
    }
    const value = await client.get(key);
    if (!value) {
      misses += 1;
      return null;
    }
    hits += 1;
    return JSON.parse(value) as T;
  } catch (error) {
    misses += 1;
    logDegradedOncePerMinute(error);
    return null;
  }
};

export const setCache = async (key: string, data: unknown, ttlSeconds: number) => {
  console.log("[REDIS] setCache called");
  try {
    const client = await ensureClientReady();
    if (!client) {
      return;
    }
    await client.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch (error) {
    logDegradedOncePerMinute(error);
    // Best-effort cache
  }
};

export const getWithRefresh = async <T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  
  // 1️⃣ Check memory cache (L1)
  // LRU touch on read: re-insert to mark as recently used
  let memoryEntry = memoryCache.get(key);
  if (memoryEntry !== undefined) {
    memoryCache.delete(key);
    memoryCache.set(key, memoryEntry);
  }
  if (memoryEntry && memoryEntry.expiresAt > now) {
    // Memory hit and not expired
    hits += 1;
    
    // Trigger background refresh if stale but not expired
    if (memoryEntry.staleAt <= now) {
      // Background refresh (non-blocking)
      fetcher()
        .then((newData) => {
          // Update Redis (L2)
          setCache(key, newData, ttlSeconds).catch(() => {
            // Ignore Redis errors in background refresh
          });
          // Update memory (L1)
          const newExpiresAt = Date.now() + ttlSeconds * 1000;
          const newStaleAt = Date.now() + ttlSeconds * 1000 * 0.8;
          memoryCache.set(key, {
            value: newData,
            expiresAt: newExpiresAt,
            staleAt: newStaleAt
          });
          // LRU eviction after set
          if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
            const oldestKey = memoryCache.keys().next().value as string | undefined;
            if (oldestKey) {
              memoryCache.delete(oldestKey);
            }
          }
        })
        .catch(() => {
          // Ignore fetcher errors in background refresh
        });
    }
    
    // Return cached value immediately
    return memoryEntry.value as T;
  }
  
  // Memory miss or expired - check Redis (L2)
  const redisCached = await getCache<T>(key);
  if (redisCached !== null) {
    // Redis hit - store in memory and return
    const expiresAt = now + ttlSeconds * 1000;
    const staleAt = now + ttlSeconds * 1000 * 0.8;
    memoryCache.set(key, {
      value: redisCached,
      expiresAt,
      staleAt
    });
    // LRU eviction after set
    if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
      const oldestKey = memoryCache.keys().next().value as string | undefined;
      if (oldestKey) {
        memoryCache.delete(oldestKey);
      }
    }
    return redisCached;
  }
  
  // Redis miss - call DB fetcher (L3)
  misses += 1;
  const fresh = await fetcher();
  
  // Store in Redis (best-effort, non-blocking)
  setCache(key, fresh, ttlSeconds).catch(() => {
    // Ignore Redis errors - continue with memory cache
  });
  
  // Store in memory
  const expiresAt = now + ttlSeconds * 1000;
  const staleAt = now + ttlSeconds * 1000 * 0.8;
  memoryCache.set(key, {
    value: fresh,
    expiresAt,
    staleAt
  });
  // LRU eviction after set
  if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }
  
  return fresh;
};

export const deleteCache = async (key: string) => {
  console.log("[REDIS] deleteCache called");
  // Clear memory cache (L1)
  memoryCache.delete(key);
  // Clear Redis cache (L2)
  try {
    const client = await ensureClientReady();
    if (!client) {
      return;
    }
    await client.del(key);
  } catch (error) {
    logDegradedOncePerMinute(error);
  }
};

export const cacheStats = () => {
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total === 0 ? 0 : hits / total
  };
};

export const invalidatePattern = async (pattern: string) => {
  console.log("[REDIS] invalidatePattern called");
  
  // Clear memory cache (L1) - convert Redis pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }
  
  // Clear Redis cache (L2)
  try {
    const client = await ensureClientReady();
    if (!client) {
      return;
    }
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    logDegradedOncePerMinute(error);
    // Best-effort invalidation
  }
};

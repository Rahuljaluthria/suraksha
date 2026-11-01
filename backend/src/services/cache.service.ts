import { redis } from "../config/redis.js";

export interface CacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  hitRatio: number;
}

const metrics: Omit<CacheMetrics, "hitRatio"> = {
  hits: 0,
  misses: 0,
  writes: 0,
  deletes: 0,
  errors: 0,
};

// Map of in-flight promises for cache stampede protection (single-flight)
const inFlightRequests = new Map<string, Promise<unknown>>();

async function isRedisReady(): Promise<boolean> {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    return redis.status === "ready";
  } catch {
    return false;
  }
}

/**
 * Retrieves a deserialized cached value by key.
 * Returns null if the key does not exist or Redis is unavailable.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!(await isRedisReady())) {
    metrics.misses++;
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      metrics.misses++;
      return null;
    }

    metrics.hits++;
    return JSON.parse(raw) as T;
  } catch (error) {
    metrics.errors++;
    console.warn(`[CacheService] Failed to read key "${key}":`, (error as Error).message);
    return null;
  }
}

/**
 * Stores a value with a time-to-live in seconds.
 * Returns true if successfully written, false otherwise.
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
  if (!(await isRedisReady())) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, "EX", ttlSeconds);
    metrics.writes++;
    return true;
  } catch (error) {
    metrics.errors++;
    console.warn(`[CacheService] Failed to set key "${key}":`, (error as Error).message);
    return false;
  }
}

/**
 * Deletes a single key from cache.
 */
export async function deleteCache(key: string): Promise<boolean> {
  if (!(await isRedisReady())) {
    return false;
  }

  try {
    const result = await redis.del(key);
    if (result > 0) {
      metrics.deletes += result;
    }
    return result > 0;
  } catch (error) {
    metrics.errors++;
    console.warn(`[CacheService] Failed to delete key "${key}":`, (error as Error).message);
    return false;
  }
}

/**
 * Deletes all keys matching a glob pattern using SCAN (non-blocking).
 * Never uses KEYS to prevent blocking the Redis event loop.
 */
export async function deleteCacheByPattern(pattern: string): Promise<number> {
  if (!(await isRedisReady())) {
    return 0;
  }

  let totalDeleted = 0;
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        totalDeleted += deleted;
      }
    } while (cursor !== "0");

    metrics.deletes += totalDeleted;
    return totalDeleted;
  } catch (error) {
    metrics.errors++;
    console.warn(`[CacheService] Failed to delete pattern "${pattern}":`, (error as Error).message);
    return totalDeleted;
  }
}

/**
 * Cache stampede protection using Single-Flight promise coalescing.
 * If multiple concurrent requests query the same cold/missing key, only ONE
 * database fetch function executes; all other callers await the exact same promise.
 */
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // 1. Try reading cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 2. Check if a fetch is already in flight for this key
  const existingFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existingFlight) {
    return existingFlight;
  }

  // 3. Initiate single-flight execution
  const flightPromise = (async () => {
    try {
      const freshData = await fetchFn();
      if (freshData !== null && freshData !== undefined) {
        await setCache(key, freshData, ttlSeconds);
      }
      return freshData;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, flightPromise);
  return flightPromise;
}

/**
 * Retrieves real-time cache performance metrics.
 */
export function getCacheMetrics(): CacheMetrics {
  const totalQueries = metrics.hits + metrics.misses;
  const hitRatio = totalQueries > 0 ? Number((metrics.hits / totalQueries).toFixed(4)) : 0;

  return {
    ...metrics,
    hitRatio,
  };
}

/**
 * Resets metrics counters (useful for benchmarks and isolated test runs).
 */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.writes = 0;
  metrics.deletes = 0;
  metrics.errors = 0;
}


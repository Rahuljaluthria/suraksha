import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis.js";

interface RedisRateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
  code?: string;
  keyGenerator?: (req: Request) => string;
}

// In-memory fallback if Redis is disconnected or fails
interface MemoryWindow {
  count: number;
  resetAt: number;
}
const memoryStore = new Map<string, MemoryWindow>();

// Periodic memory store cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

function defaultKeyGenerator(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  return `ip:${ip}`;
}

export function createRedisRateLimiter(options: RedisRateLimitOptions) {
  const {
    windowMs,
    max,
    keyPrefix,
    message = "Too many requests, please try again later.",
    code = "RATE_LIMIT_EXCEEDED",
    keyGenerator = defaultKeyGenerator,
  } = options;

  const windowSec = Math.ceil(windowMs / 1000);

  return async function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawKey = keyGenerator(req);
    const redisKey = `ratelimit:${keyPrefix}:${rawKey}`;

    let currentCount = 0;
    let ttlMs = windowMs;

    // 1. Try Redis
    let redisSuccess = false;
    try {
      if (redis.status === "ready") {
        const results = await redis
          .multi()
          .incr(redisKey)
          .pttl(redisKey)
          .exec();

        if (results && results[0] && results[1]) {
          const incrErr = results[0][0];
          const count = results[0][1] as number;
          const pttl = results[1][1] as number;

          if (!incrErr && typeof count === "number") {
            currentCount = count;
            // If this is the first request in the window, set expiry
            if (pttl === -1 || count === 1) {
              await redis.expire(redisKey, windowSec);
              ttlMs = windowMs;
            } else if (pttl > 0) {
              ttlMs = pttl;
            }
            redisSuccess = true;
          }
        }
      }
    } catch (redisErr) {
      console.warn(`[RedisRateLimit] Redis error for key "${redisKey}", falling back to memory:`, (redisErr as Error).message);
    }

    // 2. In-memory fallback if Redis was not used
    if (!redisSuccess) {
      const now = Date.now();
      const existing = memoryStore.get(redisKey);

      if (!existing || existing.resetAt <= now) {
        memoryStore.set(redisKey, { count: 1, resetAt: now + windowMs });
        currentCount = 1;
        ttlMs = windowMs;
      } else {
        existing.count += 1;
        currentCount = existing.count;
        ttlMs = Math.max(0, existing.resetAt - now);
      }
    }

    // Set standard rate limit headers
    const remaining = Math.max(0, max - currentCount);
    const resetSeconds = Math.ceil(ttlMs / 1000);

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetSeconds);

    if (currentCount > max) {
      res.setHeader("Retry-After", resetSeconds);
      res.status(429).json({
        success: false,
        code,
        message,
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}


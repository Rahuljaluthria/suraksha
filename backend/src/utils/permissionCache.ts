import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import type { RoleCode, PermissionKey } from "../config/rbac.js";

export interface CachedUserRbac {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DISABLED";
  lockedUntil: string | null; // ISO string representation
  roles: RoleCode[];
  permissions: PermissionKey[];
}

const CACHE_TTL_SECONDS = 300; // 5 minutes

function getCacheKey(userId: string): string {
  return `rbac:user:${userId}`;
}

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
 * Loads the user's fresh account status, roles, and permissions.
 * Uses a Redis cache with short TTL (5 min) and falls back seamlessly to Prisma if Redis is unavailable or on cache miss.
 * Guarantees stale permissions inside JWTs are never trusted for authorization decisions.
 */
export async function getUserRbacContext(userId: string): Promise<CachedUserRbac | null> {
  const cacheKey = getCacheKey(userId);

  // 1. Try reading from Redis cache if ready
  if (await isRedisReady()) {
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData) as CachedUserRbac;
      }
    } catch (error) {
      console.warn(`[PermissionCache] Redis cache read error for user ${userId}:`, error);
    }
  }

  // 2. Cache miss or Redis unavailable: fetch authority state from Prisma
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      lockedUntil: true,
      roles: {
        select: {
          role: {
            select: {
              code: true,
              permissions: {
                select: {
                  permission: {
                    select: {
                      key: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const roles = user.roles.map((ur) => ur.role.code as RoleCode);
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.key as PermissionKey)
      )
    )
  );

  const rbacContext: CachedUserRbac = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status as CachedUserRbac["status"],
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    roles,
    permissions,
  };

  // 3. Save to Redis cache with TTL if ready
  if (await isRedisReady()) {
    try {
      await redis.set(cacheKey, JSON.stringify(rbacContext), "EX", CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn(`[PermissionCache] Redis cache write error for user ${userId}:`, error);
    }
  }

  return rbacContext;
}

/**
 * Invalidates the cached RBAC permissions for a user.
 * Must be called whenever a user's roles, status, or role permissions are modified.
 */
export async function invalidateUserRbacCache(userId: string): Promise<void> {
  const cacheKey = getCacheKey(userId);
  if (await isRedisReady()) {
    try {
      await redis.del(cacheKey);
    } catch (error) {
      console.warn(`[PermissionCache] Redis cache invalidation error for user ${userId}:`, error);
    }
  }
}

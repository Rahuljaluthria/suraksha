import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/tokens.js";
import { getUserRbacContext } from "../utils/permissionCache.js";
import type { RoleCode, PermissionKey } from "../config/rbac.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DISABLED";
  roles: RoleCode[];
  permissions: PermissionKey[];
  hasRole: (role: RoleCode | RoleCode[]) => boolean;
  hasPermission: (permission: PermissionKey | PermissionKey[]) => boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Primary authentication middleware (requireAuth):
 * 1. Extracts Authorization Bearer token.
 * 2. Validates JWT signature, issuer, audience, and expiry using jose.
 * 3. Resolves fresh user account status, active roles, and permissions (via Redis / database).
 * 4. Strictly blocks disabled, suspended, locked, or unverified accounts.
 * 5. Attaches strongly-typed AuthenticatedUser context to Express Request with O(1) check methods.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "MISSING_TOKEN",
      message: "Authorization token is missing or malformed",
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      code: "MISSING_TOKEN",
      message: "Authorization Bearer token is empty",
    });
    return;
  }

  // 1. Verify token cryptographic integrity, issuer, audience, and expiration
  let payload: AccessTokenPayload;
  try {
    payload = await verifyAccessToken(token);
  } catch (error: unknown) {
    const err = error as { name?: string; code?: string };
    const isExpired = err.name === "JWTExpired" || err.code === "ERR_JWT_EXPIRED";

    res.status(401).json({
      success: false,
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: isExpired ? "Access token has expired" : "Invalid or malformed access token",
    });
    return;
  }

  // 2. Fetch fresh authority state (never trust stale claims inside JWTs)
  try {
    const rbacContext = await getUserRbacContext(payload.sub);

    if (!rbacContext) {
      res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "The authenticated account no longer exists",
      });
      return;
    }

    // 3. Account status gates
    if (rbacContext.status === "DISABLED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "Account has been disabled. Please contact your system administrator.",
      });
      return;
    }

    if (rbacContext.status === "SUSPENDED") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message: "Account is suspended. Please contact your system administrator.",
      });
      return;
    }

    if (rbacContext.status === "PENDING_VERIFICATION") {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_PENDING_VERIFICATION",
        message: "Account email verification is pending.",
      });
      return;
    }

    if (rbacContext.lockedUntil && new Date(rbacContext.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(rbacContext.lockedUntil).getTime() - Date.now()) / (60 * 1000)
      );
      res.status(403).json({
        success: false,
        code: "ACCOUNT_LOCKED",
        message: `Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`,
      });
      return;
    }

    // 4. Attach authenticated user context with O(1) Set lookups
    const roleSet = new Set<RoleCode>(rbacContext.roles);
    const permissionSet = new Set<PermissionKey>(rbacContext.permissions);

    req.user = {
      id: rbacContext.id,
      email: rbacContext.email,
      firstName: rbacContext.firstName,
      lastName: rbacContext.lastName,
      status: rbacContext.status,
      roles: rbacContext.roles,
      permissions: rbacContext.permissions,
      hasRole: (role: RoleCode | RoleCode[]) => {
        if (Array.isArray(role)) {
          return role.some((r) => roleSet.has(r));
        }
        return roleSet.has(role);
      },
      hasPermission: (permission: PermissionKey | PermissionKey[]) => {
        if (Array.isArray(permission)) {
          return permission.some((p) => permissionSet.has(p));
        }
        return permissionSet.has(permission);
      },
    };

    next();
  } catch (error) {
    console.error("[requireAuth] Error resolving user context:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication verification",
    });
  }
}

// Backward-compatibility alias
export const authenticate = requireAuth;

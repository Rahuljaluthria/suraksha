import type { Request, Response, NextFunction } from "express";
import type { RoleCode, PermissionKey } from "../config/rbac.js";
import { createAuditLog } from "../utils/audit.js";

/**
 * Middleware factory requiring the user to have at least one of the specified roles.
 * On authorization failure, logs an audit event and returns a consistent 403 Forbidden.
 */
export function requireRole(...allowedRoles: RoleCode[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Authentication required before role verification",
      });
      return;
    }

    if (!req.user.hasRole(allowedRoles)) {
      // Record authorization violation in AuditLog
      await createAuditLog({
        actorId: req.user.id,
        action: "AUTHZ_FORBIDDEN_ROLE",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          path: req.originalUrl,
          method: req.method,
          requiredRoles: allowedRoles,
          userRoles: req.user.roles,
        },
      });

      res.status(403).json({
        success: false,
        code: "FORBIDDEN_ROLE",
        message: "Access denied: You do not possess the required role to access this resource",
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory requiring the user to have at least one of the specified permissions.
 * On authorization failure, logs an audit event and returns a consistent 403 Forbidden.
 */
export function requirePermission(...requiredPermissions: PermissionKey[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Authentication required before permission verification",
      });
      return;
    }

    if (!req.user.hasPermission(requiredPermissions)) {
      // Record authorization violation in AuditLog
      await createAuditLog({
        actorId: req.user.id,
        action: "AUTHZ_FORBIDDEN_PERMISSION",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          path: req.originalUrl,
          method: req.method,
          requiredPermissions,
        },
      });

      res.status(403).json({
        success: false,
        code: "FORBIDDEN_PERMISSION",
        message: "Access denied: Insufficient permissions to perform this operation",
        requiredPermissions,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory requiring the user to possess ALL of the specified permissions.
 */
export function requireAllPermissions(...requiredPermissions: PermissionKey[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Authentication required before permission verification",
      });
      return;
    }

    const hasAll = requiredPermissions.every((p) => req.user!.hasPermission(p));

    if (!hasAll) {
      const missing = requiredPermissions.filter((p) => !req.user!.hasPermission(p));

      await createAuditLog({
        actorId: req.user.id,
        action: "AUTHZ_FORBIDDEN_PERMISSION",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          path: req.originalUrl,
          method: req.method,
          missingPermissions: missing,
        },
      });

      res.status(403).json({
        success: false,
        code: "FORBIDDEN_PERMISSION",
        message: "Access denied: Missing one or more required permissions",
        missingPermissions: missing,
      });
      return;
    }

    next();
  };
}


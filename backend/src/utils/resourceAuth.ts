import type { AuthenticatedUser } from "../middleware/auth.js";
import type { PermissionKey } from "../config/rbac.js";

export interface ResourceAuthorizationOptions {
  /**
   * The base permission prefix to check (e.g. "incident:read", "incident:update").
   */
  actionPrefix: "incident:read" | "incident:update" | "incident:comment" | string;

  /**
   * ID of the user who owns or reported the resource.
   */
  ownerId?: string | null;

  /**
   * Array of user IDs assigned to investigate or resolve the resource.
   */
  assigneeIds?: Array<string | null | undefined>;

  /**
   * Whether this is a mutating/write operation (auditors are strictly denied).
   */
  isWriteAction?: boolean;
}

export interface ResourceAuthorizationResult {
  allowed: boolean;
  reason?: string;
  matchedScope?: "all" | "assigned" | "own" | "global";
}

/**
 * Evaluates resource-level authorization based on the user's scoped permissions:
 * 1. Strictly rejects mutation/write actions if the user is an AUDITOR.
 * 2. Grants access if the user has `<action>:all`.
 * 3. Grants access if the user has `<action>:assigned` and user is in assigneeIds.
 * 4. Grants access if the user has `<action>:own` and user is ownerId.
 * 5. Rejects otherwise with a descriptive reason.
 */
export function authorizeResourceAccess(
  user: AuthenticatedUser,
  options: ResourceAuthorizationOptions
): ResourceAuthorizationResult {
  // Security Rule: Auditors are strictly read-only
  if (options.isWriteAction && user.hasRole("AUDITOR")) {
    return {
      allowed: false,
      reason: "Auditors are strictly restricted to read-only access and cannot perform write operations.",
    };
  }

  // 1. Check for global / :all scope permission (e.g. "incident:read:all")
  const allScopePermission = `${options.actionPrefix}:all` as PermissionKey;
  if (user.hasPermission(allScopePermission) || user.hasPermission(options.actionPrefix as PermissionKey)) {
    return { allowed: true, matchedScope: "all" };
  }

  // 2. Check for assigned scope permission (e.g. "incident:read:assigned")
  const assignedScopePermission = `${options.actionPrefix}:assigned` as PermissionKey;
  if (user.hasPermission(assignedScopePermission)) {
    const isAssigned = (options.assigneeIds || []).some((id) => id === user.id);
    if (isAssigned) {
      return { allowed: true, matchedScope: "assigned" };
    }
  }

  // 3. Check for own scope permission (e.g. "incident:read:own")
  const ownScopePermission = `${options.actionPrefix}:own` as PermissionKey;
  if (user.hasPermission(ownScopePermission)) {
    const isOwner = Boolean(options.ownerId && options.ownerId === user.id);
    if (isOwner) {
      return { allowed: true, matchedScope: "own" };
    }
  }

  return {
    allowed: false,
    reason: "Access denied: You are neither the creator nor an assignee of this resource, and lack universal access.",
  };
}


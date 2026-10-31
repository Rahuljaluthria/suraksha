import { Outlet } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import type { RoleCode } from "@/types/auth";
import { UnauthorizedPage } from "@/pages/error/UnauthorizedPage";

interface RoleGuardProps {
  allowedRoles: RoleCode[];
}

/**
 * Frontend route guard for role-based navigation.
 * Note: Per security rules, this guard only improves client UX;
 * authoritative authorization is strictly enforced by the backend API.
 */
export function RoleGuard({ allowedRoles }: RoleGuardProps) {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) {
    return <UnauthorizedPage requiredRoles={allowedRoles} />;
  }

  const hasAccess = user.roles.some((role) => allowedRoles.includes(role));

  if (!hasAccess) {
    return <UnauthorizedPage requiredRoles={allowedRoles} />;
  }

  return <Outlet />;
}


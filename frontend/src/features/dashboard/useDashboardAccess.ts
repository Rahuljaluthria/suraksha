import { useAppSelector } from "@/app/hooks";

const INCIDENT_READ = ["incident:read:all", "incident:read:assigned", "incident:read:own"] as const;

/**
 * What the signed-in user may see. Panels decide from permissions, never from whether a request
 * happened to succeed, so a role without access gets a clear notice instead of a spinner.
 */
export function useDashboardAccess(): { incidents: boolean; security: boolean } {
  const permissions = useAppSelector((state) => state.auth.user?.permissions);
  return {
    incidents: Boolean(permissions && INCIDENT_READ.some((p) => permissions.includes(p))),
    security: Boolean(permissions?.includes("audit:read")),
  };
}

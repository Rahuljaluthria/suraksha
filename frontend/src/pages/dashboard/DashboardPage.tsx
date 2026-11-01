import { KeyRound } from "lucide-react";
import { useAppSelector } from "@/app/hooks";
import { useDashboardAccess } from "@/features/dashboard/useDashboardAccess";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { ActivityWaveform } from "@/components/dashboard/ActivityWaveform";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { IncidentActivityFeed } from "@/components/dashboard/IncidentActivityFeed";
import { IncidentHealthScore } from "@/components/dashboard/IncidentHealthScore";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SecurityMetrics } from "@/components/dashboard/SecurityMetrics";
import { ThreatMapPanel } from "@/components/dashboard/ThreatMapPanel";

/**
 * Layout (xl): health + actions | threat map | metrics, then incident activity | waveform.
 * Tablet: two columns with the map spanning both. Mobile: a single stack in DOM order.
 */
export function DashboardPage() {
  const user = useAppSelector((state) => state.auth.user);

  const access = useDashboardAccess();
  const refresh = useDashboardData(access);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <DashboardHeader onRefresh={refresh} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="flex flex-col gap-4 md:order-1 xl:order-none xl:col-span-3">
          <IncidentHealthScore />
          <QuickActions />
        </div>

        <div className="md:order-3 md:col-span-2 xl:order-none xl:col-span-6">
          <ThreatMapPanel />
        </div>

        <div className="md:order-2 xl:order-none xl:col-span-3">
          <SecurityMetrics />
        </div>

        <div className="md:order-4 xl:order-none xl:col-span-6">
          <IncidentActivityFeed />
        </div>

        <div className="md:order-5 xl:order-none xl:col-span-6">
          <ActivityWaveform />
        </div>
      </div>

      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">
            <KeyRound className="size-3.5 text-primary" aria-hidden="true" />
            Your access
          </span>
          <span className="font-mono text-[11px]">
            {user.roles.join(", ")} · {user.permissions.length} permissions
          </span>
        </summary>
        <div className="space-y-2 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            Permissions are resolved and enforced by the backend on every request. Panels above show only what your
            role may see.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex rounded-md border border-border/50 bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {perm}
              </span>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

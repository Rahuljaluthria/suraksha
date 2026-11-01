import { useNavigate } from "react-router-dom";
import { AudioWaveform, FilePlus2, Layers, Search, Settings, Zap, type LucideIcon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { clearFilters, setFilters } from "@/features/incidents/incidentSlice";
import { cn } from "@/lib/utils";
import { DashboardCard, WidgetEmpty } from "./DashboardCard";

interface Action {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  onSelect: () => void;
}

export function QuickActions() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const stats = useAppSelector((state) => state.dashboard.stats.data);

  if (!user) return null;

  const can = (...permissions: string[]) => permissions.some((p) => user.permissions.includes(p));
  const canReadIncidents = can("incident:read:all", "incident:read:assigned", "incident:read:own");
  const canSeeActivity = can("audit:read") || canReadIncidents;

  const actions: Action[] = [];

  // Every action is gated by the same permission the destination (and its API) enforces.
  if (can("incident:create")) {
    actions.push({
      key: "report",
      label: "Report New Incident",
      description: "Describe a security event",
      icon: FilePlus2,
      onSelect: () => navigate("/incidents/report"),
    });
  }

  if (canReadIncidents) {
    actions.push({
      key: "all",
      label: "View All Incidents",
      description: "Open the incident queue",
      icon: Layers,
      badge: stats ? `${stats.open} open` : undefined,
      onSelect: () => {
        dispatch(clearFilters());
        navigate("/incidents");
      },
    });
  }

  if (canReadIncidents && can("investigation:read")) {
    actions.push({
      key: "investigate",
      label: "Investigate Incidents",
      description: "Incidents currently under investigation",
      icon: Search,
      badge: stats ? `${stats.byStatus.INVESTIGATING}` : undefined,
      onSelect: () => {
        dispatch(clearFilters());
        dispatch(setFilters({ status: "INVESTIGATING" }));
        navigate("/incidents");
      },
    });
  }

  if (canSeeActivity) {
    actions.push({
      key: "activity",
      label: "View Security Activity",
      description: can("audit:read") ? "Authentication and access events" : "Recent incident intake",
      icon: AudioWaveform,
      onSelect: () => {
        const target = document.getElementById("security-activity");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      },
    });
  }

  if (user.roles.includes("ADMIN")) {
    actions.push({
      key: "admin",
      label: "Admin Console",
      description: "Users and access control",
      icon: Settings,
      onSelect: () => navigate("/admin/users"),
    });
  }

  return (
    <DashboardCard title="Quick Actions" icon={Zap}>
      {actions.length === 0 ? (
        <WidgetEmpty>No actions are available for your role.</WidgetEmpty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {actions.map((action, index) => (
            <li key={action.key}>
              <button
                type="button"
                onClick={action.onSelect}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  index === 0
                    ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
                    : "border-border bg-background/40 hover:bg-muted/50"
                )}
              >
                <action.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground">{action.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{action.description}</span>
                </span>
                {action.badge && (
                  <span className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {action.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

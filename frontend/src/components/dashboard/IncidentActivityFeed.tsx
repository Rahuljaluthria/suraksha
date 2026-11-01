import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ListChecks, User } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useDashboardAccess } from "@/features/dashboard/useDashboardAccess";
import { fetchRecentIncidents } from "@/features/dashboard/dashboardSlice";
import { formatRelative } from "@/features/dashboard/format";
import { SeverityBadge, StatusBadge } from "@/components/incidents/IncidentBadge";
import type { IncidentItem } from "@/types/incident";
import { DashboardCard, WidgetEmpty, WidgetError, WidgetForbidden, WidgetSkeleton } from "./DashboardCard";

const FeedRow = memo(function FeedRow({ incident }: { incident: IncidentItem }) {
  const critical = incident.severity === "CRITICAL";
  const assignee = incident.assignedTo ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}` : null;
  const touched = incident.updatedAt !== incident.createdAt;

  return (
    <li>
      <Link
        to={`/incidents/${incident.id}`}
        className={`group block rounded-md border-l-2 px-3 py-2 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none ${
          critical ? "border-l-red-500/70" : "border-l-transparent"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-medium text-foreground group-hover:text-primary">{incident.title}</p>
          <time
            dateTime={incident.updatedAt}
            title={new Date(incident.updatedAt).toLocaleString()}
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
          >
            {touched ? "updated " : "reported "}
            {formatRelative(incident.updatedAt)}
          </time>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10px] text-muted-foreground">{incident.incidentNumber}</span>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="size-3" aria-hidden="true" />
            {assignee ?? "Unassigned"}
          </span>
        </div>
      </Link>
    </li>
  );
});

export function IncidentActivityFeed() {
  const dispatch = useAppDispatch();
  const widget = useAppSelector((state) => state.dashboard.recent);
  const access = useDashboardAccess();
  const items = widget.data;

  return (
    <DashboardCard
      title="Incident Activity"
      icon={ListChecks}
      className="h-full"
      bodyClassName="p-2"
      action={
        !access.incidents || widget.status === "forbidden" ? undefined : (
          <Link to="/incidents" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
            All incidents <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )
      }
    >
      {!access.incidents || widget.status === "forbidden" ? (
        <div className="p-2">
          <WidgetForbidden>Incident records are not available for your role.</WidgetForbidden>
        </div>
      ) : !items ? (
        <div className="p-2">
          {widget.status === "failed" ? (
            <WidgetError message={widget.error ?? "Could not load incidents."} onRetry={() => void dispatch(fetchRecentIncidents())} />
          ) : (
            <WidgetSkeleton lines={6} />
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="p-2">
          <WidgetEmpty>No incidents have been reported yet.</WidgetEmpty>
        </div>
      ) : (
        <>
          {widget.status === "failed" && (
            <p role="status" className="px-3 pb-1 text-[11px] text-amber-300">
              Could not refresh. Showing the last successful load.
            </p>
          )}
          <ul className="divide-y divide-border/50">
            {items.map((incident) => (
              <FeedRow key={incident.id} incident={incident} />
            ))}
          </ul>
        </>
      )}
    </DashboardCard>
  );
}

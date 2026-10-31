import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Shield,
  User,
  ArrowUpRight,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  fetchIncidents,
  setFilters,
  clearFilters,
} from "@/features/incidents/incidentSlice";
import {
  SeverityBadge,
  StatusBadge,
  PriorityBadge,
} from "@/components/incidents/IncidentBadge";
import { IncidentFilterBar } from "@/components/incidents/IncidentFilterBar";
import type { IncidentFilterParams } from "@/types/incident";
import { cn } from "@/lib/utils";

export function IncidentListPage() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { items, pagination, filters, isLoadingList, error } = useAppSelector(
    (state) => state.incidents
  );

  const canCreate =
    user?.permissions.includes("incident:create") ||
    user?.roles.includes("EMPLOYEE") ||
    user?.roles.includes("INCIDENT_COMMANDER");

  useEffect(() => {
    dispatch(fetchIncidents());
  }, [dispatch, filters.page, filters.limit, filters.sortBy, filters.sortOrder, filters.status, filters.severity, filters.category]);

  const handleFilterChange = (updated: Partial<IncidentFilterParams>) => {
    dispatch(setFilters(updated));
  };

  const handleResetFilters = () => {
    dispatch(clearFilters());
    dispatch(fetchIncidents({ page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      dispatch(setFilters({ page: newPage }));
      dispatch(fetchIncidents({ page: newPage }));
    }
  };

  const formatShortDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Security Incidents
            </h1>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary border border-primary/20">
              {pagination.total} Total
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Centralized queue for triage, forensic investigation, and response tracking.
          </p>
        </div>

        {canCreate && (
          <Link
            to="/incidents/report"
            className={cn(
              buttonVariants({ size: "sm" }),
              "gap-1.5 shadow-sm text-xs"
            )}
          >
            <Plus className="size-3.5" />
            Report Incident
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <IncidentFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      {/* Main Content Area */}
      {isLoadingList ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-border bg-card p-12 text-center space-y-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs font-mono text-muted-foreground">
            Synchronizing incident telemetry...
          </p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center space-y-3">
          <AlertTriangle className="size-6 text-destructive mx-auto" />
          <p className="text-xs text-destructive font-medium">{error}</p>
          <Button
            size="xs"
            variant="outline"
            onClick={() => dispatch(fetchIncidents())}
          >
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-border bg-card p-12 text-center space-y-3">
          <Shield className="size-8 text-muted-foreground/60" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">No Incidents Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              No security incident records match your active query filters or permissions scope.
            </p>
          </div>
          {canCreate && (
            <Link
              to="/incidents/report"
              className={cn(buttonVariants({ size: "xs", variant: "outline" }), "mt-2")}
            >
              Report a New Incident
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Desktop Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Incident #</th>
                  <th className="px-4 py-3">Title & Category</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Reported</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((incident) => (
                  <tr
                    key={incident.id}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Incident Number */}
                    <td className="px-4 py-3 font-mono font-medium text-foreground whitespace-nowrap">
                      <Link
                        to={`/incidents/${incident.id}`}
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {incident.incidentNumber}
                      </Link>
                    </td>

                    {/* Title & Category */}
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        to={`/incidents/${incident.id}`}
                        className="block font-medium text-foreground truncate hover:text-primary transition-colors"
                        title={incident.title}
                      >
                        {incident.title}
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/40">
                          {incident.category}
                        </span>
                        {incident.tags && incident.tags.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{incident.tags.length} tag{incident.tags.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <SeverityBadge severity={incident.severity} />
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PriorityBadge priority={incident.priority} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={incident.status} />
                    </td>

                    {/* Assignee */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {incident.assignedTo ? (
                        <div className="flex items-center gap-1.5 text-foreground">
                          <User className="size-3 text-muted-foreground" />
                          <span className="truncate max-w-[120px]">
                            {incident.assignedTo.firstName} {incident.assignedTo.lastName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-500/80 italic text-[11px] font-mono">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Reported At */}
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-muted-foreground text-[11px]">
                      {formatShortDate(incident.createdAt)}
                    </td>

                    {/* Action link */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        to={`/incidents/${incident.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        Inspect
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <span className="font-mono font-medium text-foreground">
                {Math.min(
                  (pagination.page - 1) * pagination.limit + 1,
                  pagination.total
                )}
              </span>{" "}
              to{" "}
              <span className="font-mono font-medium text-foreground">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{" "}
              of{" "}
              <span className="font-mono font-medium text-foreground">
                {pagination.total}
              </span>{" "}
              incidents
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono mr-1">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                size="xs"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="size-3 mr-1" />
                Previous
              </Button>

              <Button
                variant="outline"
                size="xs"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
                <ChevronRight className="size-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IncidentStatus, IncidentSeverity, IncidentFilterParams } from "@/types/incident";
import { INCIDENT_CATEGORIES } from "@/features/incidents/incidentConstants";

interface IncidentFilterBarProps {
  filters: IncidentFilterParams;
  onFilterChange: (updated: Partial<IncidentFilterParams>) => void;
  onReset: () => void;
}

export function IncidentFilterBar({
  filters,
  onFilterChange,
  onReset,
}: IncidentFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Search */}
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search || ""}
            onChange={(e) => onFilterChange({ search: e.target.value || undefined, page: 1 })}
            placeholder="Search by ticket #, title, or summary..."
            className="pl-9 h-9 text-xs bg-background"
          />
        </div>

        {/* Severity */}
        <div>
          <select
            value={filters.severity || ""}
            onChange={(e) =>
              onFilterChange({
                severity: (e.target.value as IncidentSeverity) || undefined,
                page: 1,
              })
            }
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <select
            value={filters.status || ""}
            onChange={(e) =>
              onFilterChange({
                status: (e.target.value as IncidentStatus) || undefined,
                page: 1,
              })
            }
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
          >
            <option value="">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="TRIAGED">TRIAGED</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="INVESTIGATING">INVESTIGATING</option>
            <option value="REMEDIATING">REMEDIATING</option>
            <option value="VERIFYING">VERIFYING</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="REOPENED">REOPENED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>

        {/* Category */}
        <div>
          <select
            value={filters.category || ""}
            onChange={(e) =>
              onFilterChange({
                category: e.target.value || undefined,
                page: 1,
              })
            }
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
          >
            <option value="">All Categories</option>
            {INCIDENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sorting & Quick Reset Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
            Sort by:
          </span>
          <select
            value={filters.sortBy || "createdAt"}
            onChange={(e) =>
              onFilterChange({
                sortBy: e.target.value as NonNullable<IncidentFilterParams["sortBy"]>,
                page: 1,
              })
            }
            className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground font-mono"
          >
            <option value="createdAt">Date Reported</option>
            <option value="updatedAt">Last Activity</option>
            <option value="severity">Severity Level</option>
            <option value="priority">Priority</option>
            <option value="status">Lifecycle Status</option>
          </select>

          <select
            value={filters.sortOrder || "desc"}
            onChange={(e) =>
              onFilterChange({
                sortOrder: e.target.value as "asc" | "desc",
                page: 1,
              })
            }
            className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground font-mono"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        {(filters.search ||
          filters.severity ||
          filters.status ||
          filters.category ||
          filters.sortBy !== "createdAt" ||
          filters.sortOrder !== "desc") && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onReset}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Reset Filters
          </Button>
        )}
      </div>
    </div>
  );
}

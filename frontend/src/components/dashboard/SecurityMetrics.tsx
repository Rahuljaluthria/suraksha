import { memo, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useDashboardAccess } from "@/features/dashboard/useDashboardAccess";
import { fetchStats } from "@/features/dashboard/dashboardSlice";
import { formatHours } from "@/features/dashboard/format";
import type { IncidentStats } from "@/types/dashboard";
import type { IncidentSeverity } from "@/types/incident";
import { DashboardCard, WidgetError, WidgetForbidden, WidgetSkeleton } from "./DashboardCard";

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  CRITICAL: "#f87171",
  HIGH: "#fb923c",
  MEDIUM: "#fbbf24",
  LOW: "#60a5fa",
};
const SEVERITY_ORDER: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--foreground)",
};

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "alert" | "warn" }) {
  const color = tone === "alert" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

const Charts = memo(function Charts({ stats }: { stats: IncidentStats }) {
  const severityData = useMemo(
    () => SEVERITY_ORDER.map((severity) => ({ severity, label: severity[0] + severity.slice(1).toLowerCase(), count: stats.bySeverity[severity] })),
    [stats.bySeverity]
  );
  const trendData = useMemo(
    () => stats.trends.map((t) => ({ ...t, day: new Date(`${t.date}T00:00:00`).toLocaleDateString([], { weekday: "short" }) })),
    [stats.trends]
  );
  const hasIncidents = stats.total > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground">Severity distribution</p>
        {hasIncidents ? (
          <div className="h-28" role="img" aria-label={`Incidents by severity: ${severityData.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={52} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} contentStyle={tooltipStyle} formatter={(v) => [String(v), "Incidents"]} />
                <Bar dataKey="count" radius={3} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }}>
                  {severityData.map((d) => (
                    <Cell key={d.severity} fill={SEVERITY_COLOR[d.severity]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[11px] italic text-muted-foreground">No incidents to chart yet.</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-foreground">Incidents reported, last 7 days</p>
        <div className="h-16" role="img" aria-label={`Daily incidents reported: ${trendData.map((d) => `${d.day} ${d.count}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [String(v), "Reported"]} labelFormatter={(_, p) => p?.[0]?.payload?.date ?? ""} />
              <Area type="monotone" dataKey="count" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export function SecurityMetrics() {
  const dispatch = useAppDispatch();
  const widget = useAppSelector((state) => state.dashboard.stats);
  const access = useDashboardAccess();
  const stats = widget.data;

  return (
    <DashboardCard title="Security Metrics" icon={BarChart3} className="h-full">
      {!access.incidents || widget.status === "forbidden" ? (
        <WidgetForbidden>Incident metrics are not available for your role.</WidgetForbidden>
      ) : !stats ? (
        widget.status === "failed" ? (
          <WidgetError message={widget.error ?? "Could not load metrics."} onRetry={() => void dispatch(fetchStats())} />
        ) : (
          <WidgetSkeleton lines={7} />
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Total incidents" value={String(stats.total)} />
            <Tile label="Open" value={String(stats.open)} hint="Not yet resolved, closed or rejected" />
            <Tile label="Critical (open)" value={String(stats.critical)} tone={stats.critical > 0 ? "alert" : undefined} />
            <Tile
              label="Resolved / closed"
              value={String(stats.byStatus.RESOLVED + stats.byStatus.CLOSED)}
              hint="Incidents currently in RESOLVED or CLOSED status"
            />
            <Tile
              label="Mean time to resolve"
              value={stats.resolution.meanHours === null ? "—" : formatHours(stats.resolution.meanHours)}
              hint={
                stats.resolution.meanHours === null
                  ? `No incidents were resolved in the last ${stats.resolution.windowDays} days`
                  : `Average over ${stats.resolution.resolvedCount} incident(s) resolved in the last ${stats.resolution.windowDays} days`
              }
            />
            <Tile
              label="Overdue"
              value={String(stats.overdue.total)}
              tone={stats.overdue.total > 0 ? "warn" : undefined}
              hint="Open longer than the resolution target for their severity"
            />
          </div>

          <Charts stats={stats} />

          <p className="text-[11px] text-muted-foreground">
            {stats.resolution.meanHours === null
              ? `Resolution time needs at least one incident resolved in the last ${stats.resolution.windowDays} days.`
              : `Resolution time covers ${stats.resolution.resolvedCount} incident(s) resolved in the last ${stats.resolution.windowDays} days${
                  stats.resolution.truncated ? " (capped sample)" : ""
                }.`}
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

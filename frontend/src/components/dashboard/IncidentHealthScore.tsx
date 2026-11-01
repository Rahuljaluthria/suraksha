import { useState } from "react";
import { Activity, ChevronDown, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useDashboardAccess } from "@/features/dashboard/useDashboardAccess";
import { fetchStats } from "@/features/dashboard/dashboardSlice";
import type { HealthBand } from "@/types/dashboard";
import { DashboardCard, WidgetError, WidgetForbidden, WidgetSkeleton } from "./DashboardCard";

const BAND: Record<HealthBand, { label: string; stroke: string; text: string; chip: string; blurb: string }> = {
  HEALTHY: {
    label: "Healthy",
    stroke: "var(--primary)",
    text: "text-primary",
    chip: "border-primary/30 bg-primary/10 text-primary",
    blurb: "Queue is under control.",
  },
  ELEVATED: {
    label: "Elevated",
    stroke: "#fbbf24",
    text: "text-amber-400",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    blurb: "Open risk needs attention.",
  },
  CRITICAL: {
    label: "Critical",
    stroke: "#f87171",
    text: "text-red-400",
    chip: "border-red-500/30 bg-red-500/10 text-red-300",
    blurb: "Immediate action required.",
  },
};

const SCOPE_LABEL = {
  all: "all incidents",
  assigned: "incidents assigned to you",
  own: "incidents you reported",
  assigned_and_own: "incidents you reported or are assigned to",
} as const;

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Gauge({ score, band }: { score: number; band: HealthBand }) {
  const style = BAND[band];
  return (
    <div className="relative size-36 shrink-0" role="img" aria-label={`Incident health score ${score} out of 100, ${style.label}`}>
      <svg viewBox="0 0 132 132" className="size-full -rotate-90">
        <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx="66"
          cy="66"
          r={RADIUS}
          fill="none"
          stroke={style.stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono text-3xl font-semibold tabular-nums leading-none ${style.text}`}>{score}</span>
        <span className="mt-1 font-mono text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export function IncidentHealthScore() {
  const dispatch = useAppDispatch();
  const widget = useAppSelector((state) => state.dashboard.stats);
  const access = useDashboardAccess();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const stats = widget.data;

  return (
    <DashboardCard title="Incident Health Score" icon={Activity}>
      {!access.incidents || widget.status === "forbidden" ? (
        <WidgetForbidden>Incident metrics are not available for your role.</WidgetForbidden>
      ) : !stats ? (
        widget.status === "failed" ? (
          <WidgetError message={widget.error ?? "Could not load the health score."} onRetry={() => void dispatch(fetchStats())} />
        ) : (
          <WidgetSkeleton lines={5} />
        )
      ) : (
        <div className="space-y-4">
          {widget.status === "failed" && (
            <p role="status" className="text-[11px] text-amber-300">
              Could not refresh. Showing data from {widget.updatedAt ? new Date(widget.updatedAt).toLocaleTimeString() : "the last load"}.
            </p>
          )}

          <div className="flex items-center gap-4">
            <Gauge score={stats.health.score} band={stats.health.band} />
            <div className="min-w-0 space-y-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${BAND[stats.health.band].chip}`}
              >
                {BAND[stats.health.band].label}
              </span>
              <p className="text-xs text-muted-foreground">{BAND[stats.health.band].blurb}</p>
              <Delta current={stats.health.score} previousScore={stats.previous?.health.score ?? null} />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Based on {SCOPE_LABEL[stats.scope]}. Calculated {new Date(stats.generatedAt).toLocaleTimeString()}.
          </p>

          <div>
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              aria-expanded={showBreakdown}
              aria-controls="health-breakdown"
              className="flex w-full items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
            >
              How this score is calculated
              <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${showBreakdown ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {showBreakdown && (
              <div id="health-breakdown" className="mt-2 space-y-2 rounded-md border border-border bg-background/40 p-3">
                <ul className="divide-y divide-border/60 text-xs">
                  {stats.health.components.map((c) => (
                    <li key={c.key} className="flex items-start justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="text-foreground">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.key === "resolutionPerformance"
                            ? c.note
                            : `${c.count} counted${c.pointsEach ? ` × ${c.pointsEach} pts (max ${c.maxPoints})` : ""}`}
                          {c.key === "overdue" && c.note ? `. ${c.note}` : ""}
                        </p>
                      </div>
                      <span className={`font-mono tabular-nums ${c.deduction > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {c.deduction > 0 ? `−${c.deduction}` : "0"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Score = 100 − total deductions (minimum 0). 80–100 Healthy, 50–79 Elevated, below 50 Critical.
                  Resolution targets are assumptions: critical 24h, high 72h, medium 7d, low 14d.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function Delta({ current, previousScore }: { current: number; previousScore: number | null }) {
  if (previousScore === null) {
    return (
      <p className="text-[11px] text-muted-foreground">No comparison: there was no incident history 7 days ago.</p>
    );
  }
  const diff = current - previousScore;
  if (diff === 0) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" /> No change vs 7 days ago ({previousScore})
      </p>
    );
  }
  const improved = diff > 0;
  const Icon = improved ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-[11px] ${improved ? "text-primary" : "text-red-400"}`}>
      <Icon className="size-3" aria-hidden="true" />
      {improved ? "+" : "−"}
      {Math.abs(diff)} vs 7 days ago ({previousScore})
    </p>
  );
}

import { memo, useMemo, useState } from "react";
import { AlertTriangle, AudioWaveform, Info } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotProps } from "recharts";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { fetchSecurityActivity, fetchStats } from "@/features/dashboard/dashboardSlice";
import { formatClock } from "@/features/dashboard/format";
import { useDashboardAccess } from "@/features/dashboard/useDashboardAccess";
import {
  INCIDENT_WEIGHTS,
  SECURITY_LABELS,
  SECURITY_WEIGHTS,
  SIGNAL_LABELS,
  buildIncidentWave,
  buildSecurityWave,
  latestCritical,
  type WaveMode,
  type WavePoint,
  type WaveSeverity,
} from "@/features/dashboard/waveform";
import type { ActivityCategory } from "@/types/dashboard";
import { DashboardCard, WidgetError, WidgetForbidden, WidgetSkeleton } from "./DashboardCard";

const SEVERITY_COLOR: Record<Exclude<WaveSeverity, "NONE">, string> = {
  CRITICAL: "#f87171",
  HIGH: "#fb923c",
  MEDIUM: "#fbbf24",
};

type DotPayload = DotProps & { payload?: WavePoint };

/** Only buckets that carry a real signal get a marker; the rest of the line stays clean. */
function SignalDot(props: DotPayload) {
  const { cx, cy, payload } = props;
  if (!payload || payload.severity === "NONE" || cx === undefined || cy === undefined) return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.severity === "CRITICAL" ? 5 : 4}
      fill={SEVERITY_COLOR[payload.severity]}
      stroke="var(--card)"
      strokeWidth={1.5}
    />
  );
}

function WaveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WavePoint }> }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const end = point.ts + point.span;
  return (
    <div className="max-w-60 rounded-lg border border-border bg-popover p-2.5 text-[11px] text-popover-foreground shadow-md">
      <p className="font-mono text-foreground">
        {formatClock(point.ts)}–{formatClock(end)}
      </p>
      {point.total === 0 ? (
        <p className="mt-1 text-muted-foreground">No events</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {point.counts
            .filter((c) => c.value > 0)
            .map((c) => (
              <li key={c.label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-mono tabular-nums">{c.value}</span>
              </li>
            ))}
        </ul>
      )}
      {point.signals.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-amber-300">
          {point.signals.map((s) => (
            <li key={s}>{SIGNAL_LABELS[s]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Wave = memo(function Wave({ points }: { points: WavePoint[] }) {
  const peak = useMemo(() => Math.max(1, ...points.map((p) => p.amplitude)), [points]);
  const ticks = useMemo(() => points.filter((_, i) => i % 8 === 0).map((p) => p.ts), [points]);

  return (
    <div className="h-44 w-full" role="img" aria-label="Activity waveform over the last 24 hours. Markers show buckets with high or critical signals.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(t: number) => formatClock(t)}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <YAxis hide domain={[0, peak * 1.15]} />
          <Tooltip content={<WaveTooltip />} cursor={{ stroke: "var(--border)" }} />
          <Area
            type="monotone"
            dataKey="amplitude"
            stroke="var(--primary)"
            strokeWidth={1.75}
            fill="url(#wave-fill)"
            dot={<SignalDot />}
            activeDot={{ r: 3, fill: "var(--primary)" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

function Legend({ mode }: { mode: WaveMode }) {
  const weights =
    mode === "security"
      ? (Object.keys(SECURITY_WEIGHTS) as ActivityCategory[]).map((c) => `${SECURITY_LABELS[c]} ×${SECURITY_WEIGHTS[c]}`)
      : [`Critical ×${INCIDENT_WEIGHTS.CRITICAL}`, `High ×${INCIDENT_WEIGHTS.HIGH}`, `Medium ×${INCIDENT_WEIGHTS.MEDIUM}`, `Low ×${INCIDENT_WEIGHTS.LOW}`];

  return (
    <div className="space-y-2 text-[11px] text-muted-foreground">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-primary" aria-hidden="true" /> Weighted activity
        </li>
        {(["CRITICAL", "HIGH", ...(mode === "security" ? (["MEDIUM"] as const) : [])] as const).map((sev) => (
          <li key={sev} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} aria-hidden="true" />
            {sev[0] + sev.slice(1).toLowerCase()} signal
          </li>
        ))}
      </ul>
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Info className="size-3" aria-hidden="true" /> What drives the line
        </summary>
        <p className="mt-1.5 leading-relaxed">
          Height is a weighted count per bucket: {weights.join(", ")}.
          {mode === "security"
            ? " Signals: 5+ failed logins or 5+ access denials in a bucket, any lockout, any refresh-token reuse, or a login volume of 10+ that is also 3× the usual."
            : " Markers appear on buckets that contain a high or critical incident."}
        </p>
      </details>
    </div>
  );
}

function ActivityWaveformBase() {
  const dispatch = useAppDispatch();
  const stats = useAppSelector((s) => s.dashboard.stats);
  const security = useAppSelector((s) => s.dashboard.security);
  const access = useDashboardAccess();
  const [preferred, setPreferred] = useState<WaveMode>("security");

  // Permissions decide which sources exist; widget state only says whether they have loaded.
  const securityAvailable = access.security;
  const incidentsAvailable = access.incidents;
  const mode: WaveMode = preferred === "security" && securityAvailable ? "security" : incidentsAvailable ? "incidents" : "security";
  const widget = mode === "security" ? security : stats;

  const points = useMemo(() => {
    if (mode === "security") return security.data ? buildSecurityWave(security.data) : null;
    return stats.data ? buildIncidentWave(stats.data) : null;
  }, [mode, security.data, stats.data]);

  const critical = points ? latestCritical(points) : null;
  const idle = points !== null && points.every((p) => p.total === 0);
  const truncated = mode === "security" ? security.data?.truncated : stats.data?.activity.truncated;
  const noAccess = !securityAvailable && !incidentsAvailable;

  const retry = () => {
    if (mode === "security") void dispatch(fetchSecurityActivity());
    else void dispatch(fetchStats());
  };

  return (
    <DashboardCard
      id="security-activity"
      title="Behavioral Activity"
      icon={AudioWaveform}
      className="h-full"
      action={
        securityAvailable && incidentsAvailable ? (
          <div role="group" aria-label="Activity source" className="flex rounded-md border border-border p-0.5 text-[11px]">
            {(["security", "incidents"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setPreferred(m)}
                className={`rounded px-2 py-0.5 transition-colors ${mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "security" ? "Security events" : "Incident intake"}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {noAccess ? (
        <WidgetForbidden>Activity data is not available for your role.</WidgetForbidden>
      ) : !points ? (
        widget.status === "failed" ? (
          <WidgetError message={widget.error ?? "Could not load activity."} onRetry={retry} />
        ) : (
          <WidgetSkeleton lines={6} />
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <p className="text-muted-foreground">
              Last 24 hours ·{" "}
              <span className="text-foreground">
                {mode === "security" ? "authentication and access events (audit log)" : "incidents reported to Suraksha"}
              </span>
            </p>
            <p className="font-mono text-muted-foreground" title="This panel polls once a minute. It is not a live stream.">
              Historical · polled every 60s · updated {widget.updatedAt ? formatClock(widget.updatedAt) : "—"}
            </p>
          </div>

          {critical && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Critical {mode === "security" ? "security event" : "incident"} between {formatClock(critical.ts)} and{" "}
                {formatClock(critical.ts + critical.span)}
                {critical.signals.length > 0 ? `: ${critical.signals.map((s) => SIGNAL_LABELS[s]).join(", ")}` : ""}
              </span>
            </div>
          )}

          <div className="relative">
            <Wave points={points} />
            {idle && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-muted-foreground">
                Idle: no {mode === "security" ? "security events" : "new incidents"} in the last 24 hours.
              </p>
            )}
          </div>

          {widget.status === "failed" && (
            <p role="status" className="text-[11px] text-amber-300">
              Could not refresh. Showing the last successful load.
            </p>
          )}
          {truncated && (
            <p role="status" className="text-[11px] text-amber-300">
              The window holds more events than can be charted; the oldest were left out.
            </p>
          )}
          <Legend mode={mode} />
          {mode === "incidents" && !securityAvailable && (
            <p className="text-[11px] text-muted-foreground">
              Login and access events are only visible to roles with audit access.
            </p>
          )}
          {mode === "security" && (
            <p className="text-[11px] text-muted-foreground">
              Network and system telemetry is not collected by Suraksha, so it does not appear here.
            </p>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

export const ActivityWaveform = memo(ActivityWaveformBase);

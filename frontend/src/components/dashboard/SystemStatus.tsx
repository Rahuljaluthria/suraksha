import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAppSelector } from "@/app/hooks";
import { formatClock } from "@/features/dashboard/format";
import { useDismiss } from "@/features/dashboard/useDismiss";
import type { OverallStatus, ServiceStatus } from "@/types/dashboard";

const SERVICE_DOT: Record<ServiceStatus, string> = {
  UP: "bg-primary",
  DEGRADED: "bg-amber-400",
  DOWN: "bg-red-500",
  UNKNOWN: "bg-zinc-500",
};

const SERVICE_TEXT: Record<ServiceStatus, string> = {
  UP: "Operational",
  DEGRADED: "Degraded",
  DOWN: "Down",
  UNKNOWN: "Unknown",
};

const OVERALL: Record<OverallStatus | "UNREACHABLE" | "CHECKING", { label: string; dot: string; text: string }> = {
  OPERATIONAL: { label: "All systems operational", dot: "bg-primary", text: "text-foreground" },
  DEGRADED: { label: "Degraded service", dot: "bg-amber-400", text: "text-amber-300" },
  DOWN: { label: "Service down", dot: "bg-red-500", text: "text-red-300" },
  UNREACHABLE: { label: "Status unavailable", dot: "bg-zinc-500", text: "text-muted-foreground" },
  CHECKING: { label: "Checking systems…", dot: "bg-zinc-500", text: "text-muted-foreground" },
};

/**
 * Only shows green when the backend has actually probed every dependency. A failed or missing
 * health check renders as "unavailable", never as healthy.
 */
export function SystemStatus() {
  const widget = useAppSelector((state) => state.dashboard.health);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);
  const health = widget.data;

  const key = health
    ? widget.status === "failed"
      ? "UNREACHABLE"
      : health.overall
    : widget.status === "failed" || widget.status === "forbidden"
      ? "UNREACHABLE"
      : "CHECKING";
  const view = OVERALL[key];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="system-status-panel"
        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
      >
        <span className={`size-2 rounded-full ${view.dot}`} aria-hidden="true" />
        <span className={view.text}>{view.label}</span>
        <ChevronDown className={`size-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="system-status-panel"
          className="absolute left-0 z-30 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-xs shadow-lg sm:left-auto sm:right-0"
        >
          {!health ? (
            <p className="text-muted-foreground">{widget.error ?? "Waiting for the first health check."}</p>
          ) : (
            <>
              {widget.status === "failed" && (
                <p className="mb-2 text-[11px] text-amber-300">
                  Could not refresh. Showing the check from {formatClock(health.checkedAt)}.
                </p>
              )}
              <ul className="space-y-2">
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className={`size-2 rounded-full ${widget.status === "failed" ? "bg-zinc-500" : "bg-primary"}`} aria-hidden="true" />
                    API
                  </span>
                  <span className="text-muted-foreground">{widget.status === "failed" ? "Unknown" : "Reachable"}</span>
                </li>
                {health.services.map((s) => (
                  <li key={s.key} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-foreground">
                        <span className={`size-2 rounded-full ${SERVICE_DOT[s.status]}`} aria-hidden="true" />
                        {s.label}
                      </span>
                      <span className="text-muted-foreground">
                        {SERVICE_TEXT[s.status]}
                        {s.latencyMs !== null && s.status !== "UNKNOWN" ? ` · ${s.latencyMs} ms` : ""}
                      </span>
                    </div>
                    {s.detail && <p className="pl-4 text-[11px] text-muted-foreground">{s.detail}</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                Checked {formatClock(health.checkedAt)} · API up {Math.floor(health.uptimeSeconds / 60)} min
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

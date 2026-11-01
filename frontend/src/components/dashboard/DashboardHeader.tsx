import { memo, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/app/hooks";
import { formatClock } from "@/features/dashboard/format";
import { NotificationBell } from "./NotificationBell";
import { SystemStatus } from "./SystemStatus";

/** Ticks on its own so the once-a-second update never re-renders the rest of the dashboard. */
const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const zone = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value;

  return (
    <time dateTime={now.toISOString()} className="text-right font-mono text-[11px] leading-tight text-muted-foreground">
      <span className="block">{date}</span>
      <span className="block tabular-nums text-foreground">
        {time} {zone}
      </span>
    </time>
  );
});

export function DashboardHeader({ onRefresh }: { onRefresh: () => void }) {
  const stats = useAppSelector((s) => s.dashboard.stats);
  const health = useAppSelector((s) => s.dashboard.health);
  const loading = stats.status === "loading" || health.status === "loading";
  const lastUpdated = Math.max(stats.updatedAt ?? 0, health.updatedAt ?? 0);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Suraksha</p>
          <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">Security Operations Center</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SystemStatus />
        <NotificationBell />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh dashboard"
          title={lastUpdated ? `Last updated ${formatClock(lastUpdated)}` : "Refresh dashboard"}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
        <LiveClock />
      </div>
    </header>
  );
}

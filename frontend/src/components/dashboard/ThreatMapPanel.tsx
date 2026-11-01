import { memo, useEffect, useState } from "react";
import { ExternalLink, Globe2, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "./DashboardCard";

const MAP_URL = "https://cybermap.kaspersky.com/en/widget/dynamic/dark";
/** Cross-origin iframes give no reliable error event, so a long wait is treated as a failure. */
const LOAD_TIMEOUT_MS = 20_000;

/** "starting": the iframe has loaded but the widget has not painted yet (it takes a few seconds). */
type LoadState = "loading" | "starting" | "loaded" | "slow";
const PAINT_DELAY_MS = 4_000;

/**
 * Kaspersky's public Cyberthreat Real-Time Map. This is third-party, global threat telemetry
 * and says nothing about incidents detected by Suraksha. It is labelled as such and kept
 * free of overlays so the globe has the whole panel.
 */
function ThreatMapPanelBase() {
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (state !== "loading") return;
    const timer = window.setTimeout(() => setState((s) => (s === "loading" ? "slow" : s)), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state, attempt]);

  useEffect(() => {
    if (state !== "starting") return;
    const timer = window.setTimeout(() => setState("loaded"), PAINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  return (
    <DashboardCard
      title="Global Cyberthreat Map"
      icon={Globe2}
      className="h-full"
      bodyClassName="flex flex-col gap-3 bg-[#0b1016] p-3 sm:p-4"
      action={
        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          External · Kaspersky
        </span>
      }
    >
      <div className="relative mx-auto aspect-square w-full max-w-[720px] overflow-hidden rounded-lg border border-border/60 bg-[#080b10]">
        <iframe
          key={attempt}
          src={MAP_URL}
          title="Kaspersky Cyberthreat Real-Time Map (external visualisation)"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => setState((s) => (s === "loaded" ? s : "starting"))}
          className="absolute inset-0 size-full border-0"
        />

        {state !== "loaded" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080b10] p-6 text-center">
            {offline || state === "slow" ? (
              <>
                <WifiOff className="size-6 text-amber-400" aria-hidden="true" />
                <p className="max-w-xs text-xs text-muted-foreground">
                  {offline
                    ? "You appear to be offline, so the external threat map cannot load."
                    : "The external threat map is taking too long to load or is blocked by your network or browser."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button type="button" size="xs" variant="outline" onClick={retry} className="gap-1">
                    <RefreshCw className="size-3" aria-hidden="true" />
                    Retry
                  </Button>
                  <a
                    href={MAP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground hover:bg-muted/50"
                  >
                    Open in new tab <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </div>
              </>
            ) : (
              <div role="status" className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                {state === "starting" ? "Starting global threat map…" : "Loading global threat map…"}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Threat visualisation provided by{" "}
        <a
          href="https://cybermap.kaspersky.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:text-primary"
        >
          Kaspersky Cyberthreat Real-Time Map
        </a>
        . This is external, global data. It is not incident telemetry from Suraksha.
      </p>
    </DashboardCard>
  );
}

export const ThreatMapPanel = memo(ThreatMapPanelBase);

import { useId, type ReactNode } from "react";
import { AlertCircle, Lock, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
}

/** Shared frame for every dashboard panel: one border, one header style, one spacing scale. */
export function DashboardCard({ title, icon: Icon, action, className, bodyClassName, id, children }: DashboardCardProps) {
  const headingId = useId();
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card scroll-mt-20", className)}
    >
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2
          id={headingId}
          className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground"
        >
          <Icon className="size-3.5 text-primary" aria-hidden="true" />
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function WidgetSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded bg-muted/60"
          style={{ width: `${88 - ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  );
}

export function WidgetError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p>{message}</p>
        {onRetry && (
          <Button type="button" size="xs" variant="outline" onClick={onRetry} className="gap-1">
            <RefreshCw className="size-3" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function WidgetForbidden({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{children}</p>;
}

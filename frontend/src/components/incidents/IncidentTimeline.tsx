import {
  FilePlus,
  GitCommit,
  UserCheck,
  ShieldAlert,
  Edit3,
  Clock,
} from "lucide-react";
import type { IncidentHistoryItem } from "@/types/incident";
import { StatusBadge } from "./IncidentBadge";

interface IncidentTimelineProps {
  history: IncidentHistoryItem[];
}

export function IncidentTimeline({ history }: IncidentTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        No recorded activity events yet.
      </div>
    );
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case "CREATED":
        return <FilePlus className="size-3.5 text-primary" />;
      case "STATUS_CHANGE":
        return <GitCommit className="size-3.5 text-indigo-400" />;
      case "ASSIGNED":
        return <UserCheck className="size-3.5 text-blue-400" />;
      case "SEVERITY_ASSESSED":
        return <ShieldAlert className="size-3.5 text-amber-400" />;
      default:
        return <Edit3 className="size-3.5 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:bottom-2 before:top-2 before:left-2.5 before:w-px before:bg-border">
      {history.map((event) => (
        <div key={event.id} className="relative group">
          {/* Timeline Node Dot */}
          <div className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-xs group-hover:border-primary/40 transition-colors">
            {getActionIcon(event.action)}
          </div>

          <div className="space-y-1.5 rounded-lg border border-border/70 bg-card/60 p-3 hover:border-border transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">
                  {event.actor
                    ? `${event.actor.firstName} ${event.actor.lastName}`
                    : "System / Anonymous"}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({event.action})
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                <Clock className="size-3" />
                {formatTimestamp(event.createdAt)}
              </div>
            </div>

            {/* State Transition Details */}
            {event.toStatus && (
              <div className="flex items-center gap-1.5 text-xs">
                {event.fromStatus && (
                  <>
                    <StatusBadge status={event.fromStatus} />
                    <span className="text-muted-foreground">→</span>
                  </>
                )}
                <StatusBadge status={event.toStatus} />
              </div>
            )}

            {/* Event Notes */}
            {event.notes && (
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {event.notes}
              </p>
            )}

            {/* Additional Metadata Attributes if present */}
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div className="pt-1">
                <div className="text-[10px] font-mono text-muted-foreground/80 bg-background/50 rounded p-1.5 border border-border/40">
                  {Object.entries(event.metadata).map(([key, val]) => (
                    <div key={key} className="truncate">
                      <span className="text-primary/80">{key}:</span>{" "}
                      {typeof val === "object" ? JSON.stringify(val) : String(val)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


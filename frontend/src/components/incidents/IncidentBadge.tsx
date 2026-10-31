import { cn } from "@/lib/utils";
import type { IncidentSeverity, IncidentStatus, IncidentPriority } from "@/types/incident";
import {
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from "@/features/incidents/incidentConstants";

interface SeverityBadgeProps {
  severity: IncidentSeverity;
  className?: string;
  showDot?: boolean;
}

export function SeverityBadge({
  severity,
  className,
  showDot = true,
}: SeverityBadgeProps) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.MEDIUM;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-mono font-medium border",
        cfg.bg,
        cfg.text,
        cfg.border,
        className
      )}
    >
      {showDot && <span className={cn("size-1.5 rounded-full shrink-0", cfg.dot)} />}
      {cfg.label}
    </span>
  );
}

interface StatusBadgeProps {
  status: IncidentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.NEW;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-medium border",
        cfg.bg,
        cfg.text,
        cfg.border,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: IncidentPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.P3;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-medium border",
        cfg.badge,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}


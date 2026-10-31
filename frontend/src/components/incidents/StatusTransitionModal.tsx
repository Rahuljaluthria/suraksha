import { useState } from "react";
import { X, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { IncidentStatus } from "@/types/incident";
import { ALLOWED_TRANSITIONS, STATUS_CONFIG } from "@/features/incidents/incidentConstants";
import { StatusBadge } from "./IncidentBadge";

interface StatusTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: IncidentStatus;
  userPermissions: string[];
  isSubmitting: boolean;
  onSubmit: (targetStatus: IncidentStatus, notes: string) => Promise<void>;
}

function StatusTransitionModalDialog({
  onClose,
  currentStatus,
  userPermissions,
  isSubmitting,
  onSubmit,
}: Omit<StatusTransitionModalProps, "isOpen">) {
  const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] || [];

  // Filter allowed targets by user's actual permissions
  const eligibleTargets = allowedTargets.filter((target) => {
    if (target === "RESOLVED" || target === "CLOSED") {
      return userPermissions.includes("incident:close");
    }
    if (target === "ESCALATED") {
      return userPermissions.includes("incident:escalate");
    }
    if (target === "TRIAGED" || target === "REJECTED") {
      return (
        userPermissions.includes("incident:assess") ||
        userPermissions.includes("incident:update")
      );
    }
    return userPermissions.includes("incident:update");
  });

  const [selectedTarget, setSelectedTarget] = useState<IncidentStatus | "">(
    eligibleTargets[0] || ""
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget) {
      setError("Please choose a target status");
      return;
    }
    try {
      await onSubmit(selectedTarget as IncidentStatus, notes);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Failed to transition status";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              Transition Lifecycle Status
            </h3>
            <p className="text-xs text-muted-foreground">
              Follow established SOC workflow to advance incident state.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status Progression Preview */}
          <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-background p-3">
            <div className="text-center">
              <span className="block text-[10px] text-muted-foreground uppercase font-mono mb-1">
                Current
              </span>
              <StatusBadge status={currentStatus} />
            </div>

            <ArrowRight className="size-4 text-muted-foreground" />

            <div className="text-center">
              <span className="block text-[10px] text-muted-foreground uppercase font-mono mb-1">
                Target
              </span>
              {selectedTarget ? (
                <StatusBadge status={selectedTarget as IncidentStatus} />
              ) : (
                <span className="text-xs text-muted-foreground italic">Select...</span>
              )}
            </div>
          </div>

          {/* Target Status Select */}
          <div className="space-y-1.5">
            <Label htmlFor="targetStatus" className="text-xs">
              Target Lifecycle State
            </Label>
            {eligibleTargets.length > 0 ? (
              <select
                id="targetStatus"
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value as IncidentStatus)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
              >
                {eligibleTargets.map((target) => (
                  <option key={target} value={target}>
                    {STATUS_CONFIG[target]?.label || target}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground italic bg-muted/30 p-2.5 rounded-lg border border-border">
                No permissible transitions available from {currentStatus} with your current roles.
              </p>
            )}
          </div>

          {/* Operational Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="statusNotes" className="text-xs">
              Operational Notes & Findings (Optional)
            </Label>
            <textarea
              id="statusNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide reason, remediation notes, or justification for this state update..."
              className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || eligibleTargets.length === 0 || !selectedTarget}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3 animate-spin mr-1.5" />
                  Updating...
                </>
              ) : (
                "Confirm Transition"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StatusTransitionModal(props: StatusTransitionModalProps) {
  if (!props.isOpen) return null;
  return <StatusTransitionModalDialog {...props} />;
}

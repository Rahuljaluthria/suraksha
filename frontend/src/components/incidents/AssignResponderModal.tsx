import { useState } from "react";
import { X, UserCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CandidateResponder } from "@/types/incident";

interface AssignResponderModalProps {
  isOpen: boolean;
  onClose: () => void;
  responders: CandidateResponder[];
  currentAssigneeId?: string | null;
  isSubmitting: boolean;
  onSubmit: (userId: string, role: string, notes: string) => Promise<void>;
}

function AssignResponderModalDialog({
  onClose,
  responders,
  currentAssigneeId,
  isSubmitting,
  onSubmit,
}: Omit<AssignResponderModalProps, "isOpen">) {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    currentAssigneeId || responders[0]?.id || ""
  );
  const [selectedRole, setSelectedRole] = useState<string>("PRIMARY_RESPONDER");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError("Please select an active responder");
      return;
    }
    try {
      await onSubmit(selectedUserId, selectedRole, notes);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Failed to assign responder";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-foreground font-semibold text-sm">
              <UserCheck className="size-4 text-primary" />
              Assign Incident Responder
            </div>
            <p className="text-xs text-muted-foreground">
              Select an authorized security analyst or investigator.
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
          {/* Responder Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="responderSelect" className="text-xs">
              Authorized Security Responder
            </Label>
            {responders.length > 0 ? (
              <select
                id="responderSelect"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
              >
                {responders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.firstName} {r.lastName} ({r.roles.join(", ")}) — {r.email}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground italic bg-muted/30 p-2.5 rounded-lg border border-border">
                No active responders found.
              </p>
            )}
          </div>

          {/* Operational Role */}
          <div className="space-y-1.5">
            <Label htmlFor="responderRole" className="text-xs">
              Assignment Capacity / Role
            </Label>
            <select
              id="responderRole"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
            >
              <option value="PRIMARY_RESPONDER">Primary Responder (Lead)</option>
              <option value="INVESTIGATOR">Investigator (Forensics / Analysis)</option>
              <option value="SECURITY_ENGINEER">Security Engineer (Remediation / Patch)</option>
            </select>
          </div>

          {/* Assignment Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="assignNotes" className="text-xs">
              Handover Instructions & Briefing (Optional)
            </Label>
            <textarea
              id="assignNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide briefing notes, priority directives, or context for the responder..."
              className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !selectedUserId}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3 animate-spin mr-1.5" />
                  Assigning...
                </>
              ) : (
                "Assign Responder"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AssignResponderModal(props: AssignResponderModalProps) {
  if (!props.isOpen) return null;
  return <AssignResponderModalDialog {...props} />;
}

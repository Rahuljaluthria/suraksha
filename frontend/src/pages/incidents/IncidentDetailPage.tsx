import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  UserCheck,
  GitCommit,
  User,
  Shield,
  Tag,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  fetchIncidentById,
  transitionStatus,
  assignResponder,
  fetchResponders,
} from "@/features/incidents/incidentSlice";
import {
  SeverityBadge,
  StatusBadge,
  PriorityBadge,
} from "@/components/incidents/IncidentBadge";
import { IncidentTimeline } from "@/components/incidents/IncidentTimeline";
import { StatusTransitionModal } from "@/components/incidents/StatusTransitionModal";
import { AssignResponderModal } from "@/components/incidents/AssignResponderModal";
import type { IncidentStatus } from "@/types/incident";
import { toast } from "sonner";

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const {
    selectedIncident: incident,
    responders,
    isLoadingDetail,
    isTransitioning,
    isAssigning,
    error,
  } = useAppSelector((state) => state.incidents);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchIncidentById(id));
    }
  }, [dispatch, id]);

  const userPermissions = user?.permissions || [];
  const isAuditor = user?.roles.includes("AUDITOR");
  const isCommander = user?.roles.includes("INCIDENT_COMMANDER");
  const canAssign = isCommander || userPermissions.includes("incident:assign");
  const canUpdateStatus =
    !isAuditor &&
    (userPermissions.includes("incident:update") ||
      userPermissions.includes("incident:assess") ||
      userPermissions.includes("incident:close") ||
      userPermissions.includes("incident:escalate"));

  const handleOpenAssignModal = () => {
    dispatch(fetchResponders());
    setIsAssignModalOpen(true);
  };

  const handleStatusSubmit = async (targetStatus: IncidentStatus, notes: string) => {
    if (!id) return;
    try {
      await dispatch(
        transitionStatus({ id, payload: { status: targetStatus, notes } })
      ).unwrap();
      toast.success(`Incident transitioned to ${targetStatus}`);
    } catch (err: unknown) {
      toast.error(typeof err === "string" ? err : "Failed to transition status");
      throw err;
    }
  };

  const handleAssignSubmit = async (userId: string, role: string, notes: string) => {
    if (!id) return;
    try {
      await dispatch(
        assignResponder({ id, payload: { userId, role, notes } })
      ).unwrap();
      toast.success("Incident assigned successfully");
    } catch (err: unknown) {
      toast.error(typeof err === "string" ? err : "Failed to assign incident");
      throw err;
    }
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return "—";
    try {
      return new Date(isoStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  if (isLoadingDetail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-xs font-mono text-muted-foreground">
          Fetching forensic incident telemetry...
        </p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-4">
        <AlertTriangle className="size-8 text-destructive mx-auto" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-destructive">
            Incident Access Denied or Not Found
          </h2>
          <p className="text-xs text-muted-foreground">
            {error || "The requested incident record does not exist or you lack authority to inspect it."}
          </p>
        </div>
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-mono"
        >
          <ArrowLeft className="size-3.5" />
          Return to Incidents Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div>
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Back to Incidents Registry
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between border-b border-border pb-5">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {incident.incidentNumber}
              </span>
              <SeverityBadge severity={incident.severity} />
              <PriorityBadge priority={incident.priority} />
              <StatusBadge status={incident.status} />

              {isAuditor && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border">
                  <Lock className="size-3" />
                  Read-Only Compliance
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {incident.title}
            </h1>
          </div>

          {/* Action Control Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canAssign && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAssignModal}
                className="gap-1.5 text-xs"
              >
                <UserCheck className="size-3.5 text-primary" />
                Assign Responder
              </Button>
            )}

            {canUpdateStatus && (
              <Button
                size="sm"
                onClick={() => setIsStatusModalOpen(true)}
                className="gap-1.5 text-xs"
              >
                <GitCommit className="size-3.5" />
                Update Status
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Left Narrative + Right Timeline */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols wide on Desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Narrative / Description Card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-foreground font-semibold text-xs uppercase tracking-wider font-mono">
              <Shield className="size-3.5 text-primary" />
              Incident Narrative & Observations
            </div>
            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans bg-background/50 rounded-lg p-4 border border-border/60">
              {incident.description}
            </p>

            {/* Tags */}
            {incident.tags && incident.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                <Tag className="size-3 text-muted-foreground mr-1" />
                {incident.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Responders Card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-semibold text-xs uppercase tracking-wider font-mono">
                <UserCheck className="size-3.5 text-primary" />
                Response Team & Assignments
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {incident.assignments?.filter((a) => a.isActive).length || 0} Active
              </span>
            </div>

            {incident.assignments && incident.assignments.length > 0 ? (
              <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-background/50">
                {incident.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex flex-wrap items-center justify-between p-3 gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {assignment.user.firstName} {assignment.user.lastName}
                        </span>
                        <span className="text-[10px] font-mono text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                          {assignment.role}
                        </span>
                        {assignment.isActive ? (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Reassigned
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {assignment.user.email}
                      </p>
                    </div>

                    <div className="text-[11px] font-mono text-muted-foreground">
                      Assigned {formatDate(assignment.assignedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded-lg border border-border">
                No responders currently assigned.
              </p>
            )}
          </div>

          {/* Investigation Findings (if any) */}
          {incident.investigation && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-foreground font-semibold text-xs uppercase tracking-wider font-mono">
                <CheckCircle2 className="size-3.5 text-primary" />
                Forensic Investigation Findings
              </div>
              <div className="space-y-2 text-xs">
                {incident.investigation.summary && (
                  <div>
                    <span className="font-medium text-muted-foreground block text-[11px]">
                      Summary:
                    </span>
                    <p className="text-foreground">{incident.investigation.summary}</p>
                  </div>
                )}
                {incident.investigation.rootCause && (
                  <div>
                    <span className="font-medium text-muted-foreground block text-[11px]">
                      Root Cause:
                    </span>
                    <p className="text-foreground">{incident.investigation.rootCause}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Key Details Sidebar + Activity Stream */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground border-b border-border/60 pb-2">
              Metadata & Attributes
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Category</span>
                <span className="font-mono text-foreground font-medium">
                  {incident.category}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Reported By</span>
                <span className="font-medium text-foreground flex items-center gap-1">
                  <User className="size-3 text-muted-foreground" />
                  {incident.reportedBy.firstName} {incident.reportedBy.lastName}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Primary Assignee</span>
                <span className="font-medium text-foreground">
                  {incident.assignedTo
                    ? `${incident.assignedTo.firstName} ${incident.assignedTo.lastName}`
                    : "Unassigned"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Created</span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {formatDate(incident.createdAt)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {formatDate(incident.updatedAt)}
                </span>
              </div>

              {incident.resolvedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-emerald-400 font-medium">Resolved At</span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    {formatDate(incident.resolvedAt)}
                  </span>
                </div>
              )}

              {incident.closedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Closed At</span>
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {formatDate(incident.closedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Activity Stream Card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">
                Activity Stream
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground">
                {incident.history?.length || 0} Events
              </span>
            </div>

            <IncidentTimeline history={incident.history} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <StatusTransitionModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        currentStatus={incident.status}
        userPermissions={userPermissions}
        isSubmitting={isTransitioning}
        onSubmit={handleStatusSubmit}
      />

      <AssignResponderModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        responders={responders}
        currentAssigneeId={incident.assignedToId}
        isSubmitting={isAssigning}
        onSubmit={handleAssignSubmit}
      />
    </div>
  );
}

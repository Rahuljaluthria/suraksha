import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, AlertCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { reportIncident } from "@/features/incidents/incidentSlice";
import {
  reportIncidentValidationSchema,
  type ReportIncidentFormValues,
} from "@/features/incidents/incidentValidation";
import {
  INCIDENT_CATEGORIES,
  SEVERITY_CONFIG,
  PRIORITY_CONFIG,
} from "@/features/incidents/incidentConstants";
import type { IncidentSeverity, IncidentPriority } from "@/types/incident";
import { AiReportAssistant, type AppliedReportDraft } from "@/components/ai/AiReportAssistant";
import { AiSuggestedBadge } from "@/components/ai/AiMarkers";
import { useAiStatus } from "@/features/ai/useAiStatus";
import { toast } from "sonner";
import { ZodError } from "zod";

export function ReportIncidentPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isSubmitting } = useAppSelector((state) => state.incidents);

  const [form, setForm] = useState<ReportIncidentFormValues>({
    title: "",
    description: "",
    severity: "MEDIUM",
    priority: "P3",
    category: "PHISHING",
    tagsInput: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // AI drafting is optional: shown only when the deployment has it configured and the user may use it.
  const aiStatus = useAiStatus();
  const aiDraftingEnabled = Boolean(aiStatus?.available && aiStatus.features.draftReport);
  // Form fields whose current value came from an AI draft and has not been edited since.
  const [aiFields, setAiFields] = useState<ReadonlySet<string>>(new Set());

  const handleApplyDraft = (draft: AppliedReportDraft) => {
    setForm((prev) => ({
      ...prev,
      title: draft.title,
      category: draft.category,
      severity: draft.severity,
      description: draft.description,
    }));
    setAiFields(new Set(["title", "category", "severity", "description"]));
    setErrors({});
    toast.info("AI draft applied. Review every field, then submit when you are happy with it.");
  };

  const handleChange = (
    field: keyof ReportIncidentFormValues,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (aiFields.has(field)) {
      setAiFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setApiError(null);

    try {
      const validated = reportIncidentValidationSchema.parse(form);

      const tags = validated.tagsInput
        ? validated.tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      const result = await dispatch(
        reportIncident({
          title: validated.title,
          description: validated.description,
          severity: validated.severity as IncidentSeverity,
          priority: validated.priority as IncidentPriority,
          category: validated.category,
          tags,
        })
      ).unwrap();

      toast.success(`Incident reported successfully (#${result.incidentNumber})`);
      navigate(`/incidents/${result.id}`);
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path[0] as string;
          if (path && !fieldErrors[path]) {
            fieldErrors[path] = issue.message;
          }
        }
        setErrors(fieldErrors);
      } else {
        setApiError(typeof err === "string" ? err : "Failed to report incident");
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Back Navigation */}
      <div>
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Back to Incidents Registry
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Report Security Incident
          </h1>
          <p className="text-xs text-muted-foreground">
            Submit critical security alerts, observed compromises, or anomalies for triage.
          </p>
        </div>
      </div>

      {apiError && (
        <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{apiError}</span>
        </div>
      )}

      {aiDraftingEnabled && (
        <AiReportAssistant
          formHasContent={form.title.trim().length > 0 || form.description.trim().length > 0}
          onApply={handleApplyDraft}
        />
      )}

      {/* Incident Reporting Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Incident Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-medium">
              Incident Summary / Title <span className="text-destructive">*</span>
              {aiFields.has("title") && <AiSuggestedBadge />}
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g., Suspicious outbound PowerShell communication from Workstation-04"
              className="text-xs bg-background"
            />
            {errors.title && (
              <p className="text-[11px] text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Classification: Category & Severity */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-xs font-medium">
                Threat Category <span className="text-destructive">*</span>
                {aiFields.has("category") && <AiSuggestedBadge />}
              </Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-[11px] text-destructive">{errors.category}</p>
              )}
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <Label htmlFor="severity" className="text-xs font-medium">
                Initial Severity Assessment <span className="text-destructive">*</span>
                {aiFields.has("severity") && <AiSuggestedBadge label="AI-suggested, please confirm" />}
              </Label>
              <select
                id="severity"
                value={form.severity}
                onChange={(e) =>
                  handleChange("severity", e.target.value as IncidentSeverity)
                }
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
              >
                {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => (
                  <option key={sev} value={sev}>
                    {cfg.label} Level
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority & Tags */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Priority */}
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-xs font-medium">
                Response Priority
              </Label>
              <select
                id="priority"
                value={form.priority}
                onChange={(e) =>
                  handleChange("priority", e.target.value as IncidentPriority)
                }
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary font-mono"
              >
                {Object.entries(PRIORITY_CONFIG).map(([prio, cfg]) => (
                  <option key={prio} value={prio}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label htmlFor="tagsInput" className="text-xs font-medium">
                Operational Tags (Comma separated)
              </Label>
              <Input
                id="tagsInput"
                value={form.tagsInput}
                onChange={(e) => handleChange("tagsInput", e.target.value)}
                placeholder="e.g., endpoint, powershell, critical-asset"
                className="text-xs bg-background font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description" className="text-xs font-medium">
                Detailed Incident Narrative & Indicators <span className="text-destructive">*</span>
                {aiFields.has("description") && <AiSuggestedBadge />}
              </Label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {form.description.length} / 10,000
              </span>
            </div>
            <textarea
              id="description"
              rows={6}
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Describe the anomalous observation in detail: affected hostnames, IP addresses, observed process trees, user accounts, and relevant context..."
              className="w-full rounded-lg border border-border bg-background p-3 text-xs text-foreground outline-none focus:border-primary resize-y font-sans leading-relaxed"
            />
            {errors.description && (
              <p className="text-[11px] text-destructive">{errors.description}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/incidents")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Submitting Report...
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Dispatch Incident
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

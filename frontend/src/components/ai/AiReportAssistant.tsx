import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aiService, getAiErrorMessage } from "@/services/ai.service";
import { composeIncidentDescription, type EditableReportDraft } from "@/features/ai/aiDraft";
import { INCIDENT_CATEGORIES, SEVERITY_CONFIG } from "@/features/incidents/incidentConstants";
import type { ReportDraftResponse } from "@/types/ai";
import type { IncidentSeverity } from "@/types/incident";
import { AiAdvisoryBanner, AiWarningList } from "./AiMarkers";

export interface AppliedReportDraft {
  title: string;
  category: string;
  severity: IncidentSeverity;
  description: string;
}

interface Props {
  /** True when the report form already holds user-typed content that Apply would overwrite. */
  formHasContent: boolean;
  onApply: (values: AppliedReportDraft) => void;
}

type Phase = "idle" | "loading" | "error" | "draft";

const fieldClass =
  "w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary";

export function AiReportAssistant({ formHasContent, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportDraftResponse | null>(null);
  const [edit, setEdit] = useState<EditableReportDraft | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [severity, setSeverity] = useState<IncidentSeverity>("MEDIUM");
  const [confirmingApply, setConfirmingApply] = useState(false);

  const canGenerate = input.trim().length >= 20 && phase !== "loading";

  const generate = async () => {
    setPhase("loading");
    setError(null);
    setConfirmingApply(false);
    try {
      const response = await aiService.draftReport(input.trim());
      const { draft } = response;
      setResult(response);
      setEdit({
        title: draft.title,
        summary: draft.summary,
        description: draft.description,
        assets: draft.affectedAssets.map((a) => a.name).join("\n"),
        indicators: draft.observedIndicators.map((i) => i.indicator).join("\n"),
        missing: draft.missingInformation.map((m) => `${m.field}: ${m.question}`).join("\n"),
      });
      setCategory(draft.category);
      setSeverity(draft.suggestedSeverity.level);
      setPhase("draft");
    } catch (err) {
      setError(getAiErrorMessage(err));
      setPhase("error");
    }
  };

  const discard = () => {
    setResult(null);
    setEdit(null);
    setConfirmingApply(false);
    setPhase("idle");
  };

  const apply = () => {
    if (!edit) return;
    onApply({
      title: edit.title.trim(),
      category,
      severity,
      description: composeIncidentDescription(edit),
    });
    discard();
    setOpen(false);
  };

  const requestApply = () => {
    if (formHasContent && !confirmingApply) {
      setConfirmingApply(true);
      return;
    }
    apply();
  };

  const setEditField = (field: keyof EditableReportDraft, value: string) => {
    setEdit((prev) => (prev ? { ...prev, [field]: value } : prev));
    setConfirmingApply(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          Draft with AI
          <span className="font-normal text-muted-foreground">
            Describe what happened in your own words and review a structured report before using it.
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          {phase !== "draft" && (
            <div className="space-y-2">
              <Label htmlFor="ai-input" className="text-xs font-medium">
                What happened?
              </Label>
              <textarea
                id="ai-input"
                rows={5}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={phase === "loading"}
                maxLength={5000}
                placeholder="e.g., This morning I got an email that looked like it was from IT asking me to confirm my login. I clicked the link and entered my password on laptop WS-04..."
                className={`${fieldClass} resize-y leading-relaxed`}
              />
              <p className="text-[11px] text-muted-foreground">
                Your text is sent to an external AI service. Passwords, tokens, card and ID numbers are
                masked first, but please do not paste secrets. The AI only rewrites what you wrote and
                lists what is missing; it does not add facts.
              </p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">{input.length} / 5,000</span>
                <Button type="button" size="sm" onClick={generate} disabled={!canGenerate} className="gap-1.5">
                  {phase === "loading" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Drafting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" aria-hidden="true" />
                      Generate draft
                    </>
                  )}
                </Button>
              </div>
              <div aria-live="polite" className="sr-only">
                {phase === "loading" ? "Generating draft" : ""}
              </div>
            </div>
          )}

          {phase === "error" && error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error} You can retry, or close this panel and fill in the form yourself.</span>
            </div>
          )}

          {phase === "draft" && result && edit && (
            <div className="space-y-4">
              <AiAdvisoryBanner notice={result.meta.notice} />
              <AiWarningList warnings={result.warnings} />

              <div className="space-y-1.5">
                <Label htmlFor="ai-title" className="text-xs font-medium">
                  Title
                </Label>
                <Input
                  id="ai-title"
                  value={edit.title}
                  onChange={(e) => setEditField("title", e.target.value)}
                  className="bg-background text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-summary" className="text-xs font-medium">
                  Summary
                </Label>
                <textarea
                  id="ai-summary"
                  rows={2}
                  value={edit.summary}
                  onChange={(e) => setEditField("summary", e.target.value)}
                  className={`${fieldClass} resize-y`}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-category" className="text-xs font-medium">
                    Category
                  </Label>
                  <select
                    id="ai-category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setConfirmingApply(false);
                    }}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                  >
                    {INCIDENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-severity" className="text-xs font-medium">
                    Suggested severity
                  </Label>
                  <select
                    id="ai-severity"
                    value={severity}
                    onChange={(e) => {
                      setSeverity(e.target.value as IncidentSeverity);
                      setConfirmingApply(false);
                    }}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                  >
                    {Object.entries(SEVERITY_CONFIG).map(([level, cfg]) => (
                      <option key={level} value={level}>
                        {cfg.label} Level
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                AI reasoning: {result.draft.suggestedSeverity.rationale} The security team makes the
                final severity decision.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="ai-description" className="text-xs font-medium">
                  Description
                </Label>
                <textarea
                  id="ai-description"
                  rows={5}
                  value={edit.description}
                  onChange={(e) => setEditField("description", e.target.value)}
                  className={`${fieldClass} resize-y leading-relaxed`}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-assets" className="text-xs font-medium">
                    Affected assets <span className="font-normal text-muted-foreground">(one per line)</span>
                  </Label>
                  <textarea
                    id="ai-assets"
                    rows={3}
                    value={edit.assets}
                    onChange={(e) => setEditField("assets", e.target.value)}
                    placeholder="None identified in your description"
                    className={`${fieldClass} resize-y font-mono`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-indicators" className="text-xs font-medium">
                    Observed indicators <span className="font-normal text-muted-foreground">(one per line)</span>
                  </Label>
                  <textarea
                    id="ai-indicators"
                    rows={3}
                    value={edit.indicators}
                    onChange={(e) => setEditField("indicators", e.target.value)}
                    placeholder="None identified in your description"
                    className={`${fieldClass} resize-y font-mono`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-missing" className="text-xs font-medium">
                  Information still needed{" "}
                  <span className="font-normal text-muted-foreground">
                    (answer these in the description, or leave them for the responders)
                  </span>
                </Label>
                <textarea
                  id="ai-missing"
                  rows={4}
                  value={edit.missing}
                  onChange={(e) => setEditField("missing", e.target.value)}
                  className={`${fieldClass} resize-y`}
                />
              </div>

              {confirmingApply && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300"
                >
                  Applying will replace the title, category, severity and description already in the
                  report form below. Nothing is submitted until you press Dispatch Incident.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="outline" size="sm" onClick={discard}>
                  Discard
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={generate} className="gap-1.5">
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Regenerate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={requestApply}
                  disabled={edit.title.trim().length < 3}
                  className="gap-1.5"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  {confirmingApply ? "Yes, replace and apply" : "Apply to report form"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

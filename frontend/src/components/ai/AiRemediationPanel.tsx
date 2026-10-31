import { useState } from "react";
import { AlertCircle, ClipboardCopy, Info, Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/incidents/IncidentBadge";
import { aiService, getAiErrorMessage } from "@/services/ai.service";
import type { AiRiskFlag, RemediationPlanResponse, RemediationRecommendation } from "@/types/ai";
import { AiAdvisoryBanner, AiSectionHeading, AiWarningList } from "./AiMarkers";

interface Props {
  incidentId: string;
  /** The incident's current updatedAt, used to tell the reader when a plan is out of date. */
  incidentUpdatedAt: string;
}

type Phase = "idle" | "loading" | "error" | "result";
type Review = "ACCEPTED" | "DISMISSED";

const chip =
  "inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground";

const RISK_LABEL: Record<AiRiskFlag, string> = {
  EVIDENCE_LOSS: "May destroy forensic evidence",
  DESTRUCTIVE: "Destructive action",
  SERVICE_DISRUPTION: "May disrupt users or services",
  CONTAINS_COMMAND: "Contains command text: review before running",
};

function planToText(response: RemediationPlanResponse, accepted: RemediationRecommendation[]): string {
  return [
    `${response.incident.incidentNumber}: remediation steps (AI-suggested, accepted by a reviewer, not yet executed)`,
    ...accepted.map(
      (r, i) =>
        `${i + 1}. [${r.priority}] ${r.action}\n   Expected: ${r.expectedOutcome}\n   Verify: ${r.verification}` +
        (r.risks ? `\n   Risks: ${r.risks}` : "")
    ),
  ].join("\n");
}

export function AiRemediationPanel({ incidentId, incidentUpdatedAt }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RemediationPlanResponse | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  const run = async () => {
    setPhase("loading");
    setError(null);
    setReviews({});
    try {
      setResult(await aiService.recommendRemediation(incidentId));
      setPhase("result");
    } catch (err) {
      setError(getAiErrorMessage(err));
      setPhase("error");
    }
  };

  const toggleReview = (id: string, next: Review) =>
    setReviews((prev) => {
      const copy = { ...prev };
      if (copy[id] === next) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const plan = result?.plan;
  const accepted = plan?.recommendations.filter((r) => reviews[r.id] === "ACCEPTED") ?? [];

  const isStale =
    result !== null &&
    new Date(result.meta.incidentUpdatedAt).getTime() !== new Date(incidentUpdatedAt).getTime();

  const copyAccepted = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(planToText(result, accepted));
      toast.success("Accepted steps copied. Nothing was executed.");
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
            <ShieldAlert className="size-3.5 text-primary" aria-hidden="true" />
            AI Remediation Suggestions
          </div>
          <p className="text-[11px] text-muted-foreground">
            Suggestions only. Suraksha never runs, applies or saves these.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={phase === "result" ? "outline" : "default"}
          onClick={run}
          disabled={phase === "loading"}
          className="gap-1.5 text-xs"
        >
          {phase === "loading" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Working…
            </>
          ) : phase === "result" ? (
            <>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Suggest remediation
            </>
          )}
        </Button>
      </div>

      <div aria-live="polite" className="sr-only">
        {phase === "loading" ? "Generating remediation suggestions" : ""}
      </div>

      {phase === "idle" && (
        <p className="text-[11px] text-muted-foreground">
          Sends this incident's text to an external AI service with passwords, tokens, card and ID numbers
          masked. Reporter and responder identities are not sent. You get prioritised steps with rationale,
          expected outcome and how to verify each one. Every step needs a person to review and approve it.
        </p>
      )}

      {phase === "loading" && <p className="text-[11px] text-muted-foreground">This can take up to a minute.</p>}

      {phase === "error" && error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && plan && phase !== "loading" && (
        <div className="space-y-5">
          <AiAdvisoryBanner notice={result.meta.notice} />

          {isStale && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              This incident has changed since these suggestions were generated. Regenerate to include the latest updates.
            </div>
          )}

          <AiWarningList warnings={result.warnings} heading="Check before approving anything here" />

          <section aria-labelledby="rem-summary" className="space-y-1.5">
            <AiSectionHeading id="rem-summary" title="Approach" hint="An interpretation, not a decision." />
            <p className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs leading-relaxed text-foreground/90">
              {plan.summary}
            </p>
          </section>

          <section aria-labelledby="rem-steps" className="space-y-2">
            <AiSectionHeading
              id="rem-steps"
              title={`Suggested steps (${plan.recommendations.length})`}
              hint="Most urgent first. Priorities are the AI's suggestion; the response team decides."
            />
            {plan.recommendations.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">No steps were suggested.</p>
            ) : (
              <ol className="space-y-3">
                {plan.recommendations.map((r) => {
                  const review = reviews[r.id];
                  return (
                    <li
                      key={r.id}
                      className={`space-y-2 rounded-lg border p-3 text-xs ${
                        review === "ACCEPTED"
                          ? "border-primary/40 bg-primary/5"
                          : review === "DISMISSED"
                            ? "border-border bg-background/20 opacity-60"
                            : "border-border bg-background/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={chip}>{r.id}</span>
                        <PriorityBadge priority={r.priority} />
                        <span className={chip}>{r.phase.toLowerCase()}</span>
                        {r.riskFlags.map((flag) => (
                          <span
                            key={flag}
                            className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                          >
                            <ShieldAlert className="size-3" aria-hidden="true" />
                            {RISK_LABEL[flag]}
                          </span>
                        ))}
                      </div>

                      <p className="text-sm font-medium text-foreground">{r.action}</p>
                      {r.priorityNote && <p className="text-[11px] text-amber-300">{r.priorityNote}</p>}

                      <div className="space-y-1 text-foreground/85">
                        <p>
                          <span className="font-medium text-foreground">Why: </span>
                          {r.rationale}
                        </p>
                        {r.evidenceVerified && r.evidenceQuote ? (
                          <blockquote className="border-l-2 border-primary/40 pl-2 font-mono text-[11px] text-muted-foreground">
                            {r.evidenceQuote}
                          </blockquote>
                        ) : (
                          <p className="text-[11px] italic text-amber-300">
                            Not tied to a verifiable quote from the incident record. Treat as general advice.
                          </p>
                        )}
                        <p>
                          <span className="font-medium text-foreground">Expected outcome: </span>
                          {r.expectedOutcome}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">How to verify: </span>
                          {r.verification}
                        </p>
                        {r.risks && (
                          <p>
                            <span className="font-medium text-foreground">Risks: </span>
                            {r.risks}
                          </p>
                        )}
                      </div>

                      {r.targetAssets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>Targets:</span>
                          {r.targetAssets.map((asset) => (
                            <span key={asset} className={chip}>
                              {asset}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.unverifiedDetails.length > 0 && (
                        <p role="alert" className="text-[11px] text-amber-300">
                          Mentions details that are not in the incident record:{" "}
                          <span className="font-mono">{r.unverifiedDetails.join(", ")}</span>. Verify before acting.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                        <span className="text-[10px] text-muted-foreground">Your review (not saved):</span>
                        <Button
                          type="button"
                          size="xs"
                          variant={review === "ACCEPTED" ? "default" : "outline"}
                          aria-pressed={review === "ACCEPTED"}
                          onClick={() => toggleReview(r.id, "ACCEPTED")}
                        >
                          Accept for follow-up
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant={review === "DISMISSED" ? "secondary" : "outline"}
                          aria-pressed={review === "DISMISSED"}
                          onClick={() => toggleReview(r.id, "DISMISSED")}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {plan.recommendations.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {accepted.length} of {plan.recommendations.length} accepted. Accepting only marks a step for
                  your own follow-up. It does not run anything and is not recorded on the incident.
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={copyAccepted}
                  disabled={accepted.length === 0}
                  className="gap-1"
                >
                  <ClipboardCopy className="size-3" aria-hidden="true" />
                  Copy accepted steps
                </Button>
              </div>
            )}
          </section>

          {plan.assumptions.length > 0 && (
            <section aria-labelledby="rem-assumptions" className="space-y-2">
              <AiSectionHeading
                id="rem-assumptions"
                title="Assumptions"
                hint="The plan relies on these. They are not confirmed by the record."
              />
              <ul className="list-disc space-y-1 pl-5 text-xs text-foreground/90">
                {plan.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}

          {plan.informationNeeded.length > 0 && (
            <section aria-labelledby="rem-needed" className="space-y-2">
              <AiSectionHeading
                id="rem-needed"
                title="Information needed"
                hint="Missing from the record and could change the plan."
              />
              <ul className="list-disc space-y-1 pl-5 text-xs text-foreground/90">
                {plan.informationNeeded.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
            Generated {new Date(result.meta.generatedAt).toLocaleString()} · {result.meta.model} · incident
            severity {result.incident.severity}
          </p>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { AlertCircle, Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiService, getAiErrorMessage } from "@/services/ai.service";
import type { IncidentAnalysisResponse } from "@/types/ai";
import { AiAdvisoryBanner, AiSectionHeading, AiWarningList, ConfidenceBadge } from "./AiMarkers";

interface Props {
  incidentId: string;
  /** The incident's current updatedAt, used to tell the reader when an analysis is out of date. */
  incidentUpdatedAt: string;
}

type Phase = "idle" | "loading" | "error" | "result";

const chip =
  "inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground";

const CATEGORY_LABEL: Record<string, string> = {
  ATTACK_VECTOR: "Attack vector",
  ROOT_CAUSE: "Root cause",
  IMPACT: "Impact",
  OTHER: "Other",
};

export function AiAnalysisPanel({ incidentId, incidentUpdatedAt }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IncidentAnalysisResponse | null>(null);

  const run = async () => {
    setPhase("loading");
    setError(null);
    try {
      setResult(await aiService.analyzeIncident(incidentId));
      setPhase("result");
    } catch (err) {
      setError(getAiErrorMessage(err));
      setPhase("error");
    }
  };

  const isStale =
    result !== null &&
    new Date(result.meta.incidentUpdatedAt).getTime() !== new Date(incidentUpdatedAt).getTime();

  const analysis = result?.analysis;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            AI Analysis
          </div>
          <p className="text-[11px] text-muted-foreground">
            Advisory only. Results are shown here and are not saved to the incident.
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
              Analyzing…
            </>
          ) : phase === "result" ? (
            <>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Re-analyze
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Analyze incident
            </>
          )}
        </Button>
      </div>

      <div aria-live="polite" className="sr-only">
        {phase === "loading" ? "Analyzing incident" : ""}
      </div>

      {phase === "idle" && (
        <p className="text-[11px] text-muted-foreground">
          Sends this incident's text to an external AI service with passwords, tokens, card and ID numbers
          masked. Reporter and responder names and emails are not sent. You get observed facts and
          hypotheses in separate lists, with confidence levels and missing evidence.
        </p>
      )}

      {phase === "loading" && (
        <p className="text-[11px] text-muted-foreground">This can take up to a minute.</p>
      )}

      {phase === "error" && error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && analysis && phase !== "loading" && (
        <div className="space-y-5">
          <AiAdvisoryBanner notice={result.meta.notice} />

          {isStale && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              This incident has changed since the analysis was run. Re-analyze to include the latest updates.
            </div>
          )}

          <AiWarningList warnings={result.warnings} heading="Check before relying on this analysis" />

          <section aria-labelledby="ai-summary" className="space-y-1.5">
            <AiSectionHeading id="ai-summary" title="AI summary" hint="An interpretation, not a record." />
            <p className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs leading-relaxed text-foreground/90">
              {analysis.summary}
            </p>
          </section>

          <section aria-labelledby="ai-facts" className="space-y-2">
            <AiSectionHeading
              id="ai-facts"
              title={`Observed facts (${analysis.observedFacts.length})`}
              hint="Quoted from this incident's record and checked by the server."
            />
            {analysis.observedFacts.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">No verifiable facts were extracted.</p>
            ) : (
              <ul className="space-y-2">
                {analysis.observedFacts.map((fact) => (
                  <li key={fact.id} className="rounded-lg border border-border bg-background/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={chip}>{fact.id}</span>
                      <span className={chip}>from {fact.source.toLowerCase()}</span>
                    </div>
                    <p className="mt-1.5 text-foreground">{fact.statement}</p>
                    <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2 font-mono text-[11px] text-muted-foreground">
                      {fact.sourceQuote}
                    </blockquote>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {analysis.indicators.length > 0 && (
            <section aria-labelledby="ai-indicators" className="space-y-2">
              <AiSectionHeading
                id="ai-indicators"
                title={`Indicators (${analysis.indicators.length})`}
                hint="Observables that appear in the record."
              />
              <ul className="flex flex-wrap gap-1.5">
                {analysis.indicators.map((ind) => (
                  <li
                    key={`${ind.type}:${ind.indicator}`}
                    title={ind.sourceQuote}
                    className="inline-flex items-center gap-1.5 rounded border border-border bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground"
                  >
                    <span className="text-[9px] text-muted-foreground">{ind.type.replace(/_/g, " ")}</span>
                    {ind.indicator}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="ai-hypotheses" className="space-y-2">
            <AiSectionHeading
              id="ai-hypotheses"
              title={`Hypotheses (${analysis.hypotheses.length})`}
              hint="Inferences, not facts. Nothing here is verified. Confidence is limited by the facts cited."
            />
            {analysis.hypotheses.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">No hypotheses were offered.</p>
            ) : (
              <ul className="space-y-2">
                {analysis.hypotheses.map((h) => (
                  <li
                    key={h.id}
                    className="space-y-1.5 rounded-lg border border-dashed border-border bg-background/30 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={chip}>{h.id}</span>
                      <span className={chip}>{CATEGORY_LABEL[h.category] ?? h.category}</span>
                      <ConfidenceBadge level={h.confidence} />
                      <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300">
                        hypothesis
                      </span>
                    </div>
                    <p className="font-medium text-foreground">{h.statement}</p>
                    <p className="text-foreground/80">{h.reasoning}</p>
                    {h.confidenceNote && <p className="text-[11px] text-amber-300">{h.confidenceNote}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>Based on:</span>
                      {h.supportingFactIds.length > 0 ? (
                        h.supportingFactIds.map((id) => (
                          <span key={id} className={chip}>
                            {id}
                          </span>
                        ))
                      ) : (
                        <span className="italic">no facts cited</span>
                      )}
                    </div>
                    {h.howToVerify && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">How to verify: </span>
                        {h.howToVerify}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {analysis.suspiciousPatterns.length > 0 && (
            <section aria-labelledby="ai-patterns" className="space-y-2">
              <AiSectionHeading
                id="ai-patterns"
                title={`Suspicious patterns (${analysis.suspiciousPatterns.length})`}
                hint="Combinations in the record that deserve a closer look."
              />
              <ul className="space-y-2">
                {analysis.suspiciousPatterns.map((p) => (
                  <li key={p.pattern} className="rounded-lg border border-border bg-background/50 p-3 text-xs">
                    <p className="font-medium text-foreground">{p.pattern}</p>
                    <p className="mt-1 text-foreground/80">{p.explanation}</p>
                    {p.supportingFactIds.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>Based on:</span>
                        {p.supportingFactIds.map((id) => (
                          <span key={id} className={chip}>
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="ai-missing" className="space-y-2">
            <AiSectionHeading
              id="ai-missing"
              title={`Missing evidence (${analysis.missingEvidence.length})`}
              hint="Not in the record, and would change the analysis."
            />
            {analysis.missingEvidence.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">No gaps were identified.</p>
            ) : (
              <ul className="list-disc space-y-1.5 pl-5 text-xs text-foreground/90">
                {analysis.missingEvidence.map((m) => (
                  <li key={m.item}>
                    <span className="font-medium">{m.item}</span>
                    {m.whyItMatters && <span className="text-muted-foreground"> — {m.whyItMatters}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
            Generated {new Date(result.meta.generatedAt).toLocaleString()} · {result.meta.model} ·{" "}
            {result.meta.historyEntriesConsidered} history entries
            {result.meta.hasInvestigation ? " · investigation notes included" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

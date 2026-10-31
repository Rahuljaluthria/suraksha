import { Sparkles, TriangleAlert } from "lucide-react";

/** Shown on every AI result so nobody mistakes it for a verified record. */
export function AiAdvisoryBanner({ notice }: { notice: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] text-foreground/80">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{notice}</span>
    </div>
  );
}

/** Marks a form field whose current value came from AI and has not been edited since. */
export function AiSuggestedBadge({ label = "AI-suggested" }: { label?: string }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium text-primary">
      <Sparkles className="size-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function AiWarningList({
  warnings,
  heading = "Check before using this draft",
}: {
  warnings: string[];
  heading?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300"
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        {heading}
      </div>
      <ul className="list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

const CONFIDENCE_STYLES: Record<"LOW" | "MEDIUM" | "HIGH", string> = {
  LOW: "border-border bg-muted/40 text-muted-foreground",
  MEDIUM: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  HIGH: "border-primary/40 bg-primary/10 text-primary",
};

/** How strongly the record supports a hypothesis. Deliberately not a red/green severity scale. */
export function ConfidenceBadge({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${CONFIDENCE_STYLES[level]}`}
    >
      Confidence: {level}
    </span>
  );
}

export function AiSectionHeading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="space-y-0.5">
      <h4 id={id} className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h4>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export interface EditableReportDraft {
  title: string;
  summary: string;
  description: string;
  /** One asset per line. */
  assets: string;
  /** One indicator per line. */
  indicators: string;
  /** One "field: question" per line. */
  missing: string;
}

const lines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

const section = (heading: string, items: string[]): string =>
  items.length > 0 ? `${heading}\n${items.map((item) => `- ${item}`).join("\n")}` : "";

/**
 * Builds the incident description from the (already user-edited) draft. The incident API has
 * no dedicated fields for assets, indicators or open questions, so they travel as labelled
 * sections that responders can read and that the employee has had the chance to edit.
 */
export function composeIncidentDescription(draft: EditableReportDraft): string {
  return [
    draft.summary.trim() ? `Summary: ${draft.summary.trim()}` : "",
    draft.description.trim(),
    section("Affected assets:", lines(draft.assets)),
    section("Observed indicators:", lines(draft.indicators)),
    section("Information not yet provided:", lines(draft.missing)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

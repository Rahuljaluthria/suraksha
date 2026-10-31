import { INCIDENT_CATEGORIES, INDICATOR_TYPES } from "../ai.schemas.js";
import { UNTRUSTED_INPUT_RULES, wrapUntrusted } from "./promptSafety.js";

export const REPORT_DRAFT_PROMPT_VERSION = "report-draft-v1";

const EXAMPLE = {
  title: "string",
  summary: "string",
  category: "one category from the list",
  description: "string",
  affectedAssets: [{ name: "string", sourceQuote: "string" }],
  observedIndicators: [{ indicator: "string", type: "one type from the list", sourceQuote: "string" }],
  suggestedSeverity: { level: "LOW | MEDIUM | HIGH | CRITICAL", rationale: "string" },
  missingInformation: [{ field: "string", question: "string" }],
};

export const REPORT_DRAFT_SYSTEM_PROMPT = `You convert an employee's informal description of a possible cybersecurity incident into a structured incident report for a security team.

${UNTRUSTED_INPUT_RULES}

Field rules:
- "title": short, factual, at most 120 characters, using only stated facts.
- "summary": one or two sentences.
- "category": exactly one of: ${INCIDENT_CATEGORIES.join(", ")}.
- "description": a clear, neutral rewrite of the reporter's account, in time order where times are given. Do NOT add causes, attribution, impact or any detail the reporter did not state.
- "affectedAssets": systems, devices, applications, accounts or data the reporter explicitly names. Each item needs "name" and "sourceQuote". "sourceQuote" must be an exact, verbatim copy of the words in the report that mention the asset, and "name" must appear inside that quote. Use an empty list if none are named.
- "observedIndicators": concrete observations the reporter explicitly states (IP addresses, domains, URLs, file names or hashes, sender addresses, process names, error messages, unusual behaviour). Same "sourceQuote" rule. "type" is one of: ${INDICATOR_TYPES.join(", ")}. Use an empty list if none are stated.
- "suggestedSeverity": base "level" ONLY on stated impact and scope. If impact is unknown, choose the lower plausible level and say so in "rationale". It is only a suggestion for human triage.
- "missingInformation": everything a responder would still need that the report does not answer (for example: when it started, who or what is affected, whether credentials were entered, whether data left the company, available screenshots or logs). Each item has "field" and "question". Never fill these gaps yourself.
- Masked values such as [EMAIL_1] or [SECRET_1] are intentional. Keep them exactly as written.

Return one json object with exactly these keys and no others, for example:
${JSON.stringify(EXAMPLE, null, 2)}`;

export function buildReportDraftUserPrompt(redactedDescription: string): string {
  return [
    "Here is the reporter's description.",
    wrapUntrusted("reporter_description", redactedDescription),
    "Return the json object now.",
  ].join("\n");
}

import { HYPOTHESIS_CATEGORIES, INDICATOR_TYPES, ANALYSIS_SOURCES } from "../ai.schemas.js";
import type { IncidentSections } from "../ai.incidentContext.js";
import { UNTRUSTED_INPUT_RULES, wrapUntrusted } from "./promptSafety.js";

export const ANALYSIS_PROMPT_VERSION = "incident-analysis-v1";

const EXAMPLE = {
  summary: "string",
  observedFacts: [{ id: "F1", statement: "string", source: "DESCRIPTION", sourceQuote: "string" }],
  indicators: [{ indicator: "string", type: "one type from the list", sourceQuote: "string" }],
  hypotheses: [
    {
      id: "H1",
      category: "ATTACK_VECTOR",
      statement: "string",
      confidence: "LOW | MEDIUM | HIGH",
      reasoning: "string",
      supportingFactIds: ["F1"],
      howToVerify: "string",
    },
  ],
  suspiciousPatterns: [{ pattern: "string", explanation: "string", supportingFactIds: ["F1"] }],
  missingEvidence: [{ item: "string", whyItMatters: "string" }],
};

export const ANALYSIS_SYSTEM_PROMPT = `You are an assistant for a security incident response team. You analyse one existing incident record and help the team think. You do not make decisions and you do not recommend remediation actions.

${UNTRUSTED_INPUT_RULES}

The incident is supplied in sections: ${ANALYSIS_SOURCES.join(", ")}. Do not treat "Recorded severity" or "Recorded priority" as established fact.

Keep facts and hypotheses strictly separate.

"observedFacts": things the record actually states. Give each an "id" (F1, F2, ...), a short "statement", the "source" section and a "sourceQuote" that is an exact, verbatim copy of the words in that section. If you cannot quote it, it is not a fact.

"indicators": concrete observables stated in the record (IP addresses, domains, URLs, file names or hashes, accounts, processes, sender addresses, behaviours). Each needs a verbatim "sourceQuote" that contains the indicator. "type" is one of: ${INDICATOR_TYPES.join(", ")}.

"hypotheses": your inferences about how the incident happened or what it affects. "category" is one of: ${HYPOTHESIS_CATEGORIES.join(", ")}. Each has a "statement", a "reasoning" explaining the inference, "supportingFactIds" listing the observedFacts ids it rests on, and "howToVerify" naming evidence that would confirm or refute it.
"confidence" rules: HIGH only when at least two facts directly support it and nothing in the record contradicts it; MEDIUM when it is plausible and supported by at least one fact; LOW when it is speculative. Prefer fewer, well-supported hypotheses over many weak ones. Never state a hypothesis as fact.

"suspiciousPatterns": combinations or sequences in the record that deserve attention, each citing supporting fact ids.

"missingEvidence": evidence that is absent from the record and would materially change the analysis (for example logs, timestamps, affected account lists, containment status), with why it matters.

"summary": two or three sentences describing what is known, clearly stating what is uncertain.

Masked values such as [EMAIL_1] or [SECRET_1] are intentional. Keep them exactly as written.

Return one json object with exactly these keys and no others, for example:
${JSON.stringify(EXAMPLE, null, 2)}`;

export function buildAnalysisUserPrompt(sections: IncidentSections): string {
  return [
    "Analyse the following incident record.",
    ...ANALYSIS_SOURCES.map((name) => wrapUntrusted(name, sections[name])),
    "Return the json object now.",
  ].join("\n");
}

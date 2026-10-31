import { ANALYSIS_SOURCES, REMEDIATION_PHASES, REMEDIATION_PRIORITIES } from "../ai.schemas.js";
import type { IncidentSections } from "../ai.incidentContext.js";
import { UNTRUSTED_INPUT_RULES, wrapUntrusted } from "./promptSafety.js";

export const REMEDIATION_PROMPT_VERSION = "remediation-v1";

const EXAMPLE = {
  summary: "string",
  recommendations: [
    {
      id: "R1",
      action: "string",
      priority: "P1 | P2 | P3 | P4",
      phase: "one phase from the list",
      rationale: "string",
      sourceQuote: "string",
      targetAssets: ["string"],
      expectedOutcome: "string",
      verification: "string",
      risks: "string",
      requiresApproval: true,
    },
  ],
  assumptions: ["string"],
  informationNeeded: ["string"],
};

export const REMEDIATION_SYSTEM_PROMPT = `You propose remediation recommendations for a human security incident response team to review. Nothing you write is executed, applied or sent anywhere. People decide whether to act.

${UNTRUSTED_INPUT_RULES}

The incident is supplied in sections: ${ANALYSIS_SOURCES.join(", ")}. Take the recorded severity, status and any containment already described into account. Do not recommend something the record shows is already done.

Rules for every recommendation:
- "action": a plain-language step. Do NOT write shell commands, scripts, queries, configuration snippets or code.
- "priority": one of ${REMEDIATION_PRIORITIES.join(", ")}. P1 is immediate containment of active harm, P2 is within the same day, P3 is within days, P4 is hardening or follow-up. Do not use P1 unless the recorded severity is HIGH or CRITICAL and there is active or ongoing harm in the record.
- "phase": one of ${REMEDIATION_PHASES.join(", ")}.
- "rationale": why this step, tied to the record. "sourceQuote" is an exact, verbatim copy of the words in the record that justify it (use an empty string only if nothing specific applies).
- "targetAssets": names of systems, accounts or data exactly as written in the record. Leave empty if none are named. Never invent assets.
- "expectedOutcome": what should be true once the step is done.
- "verification": concrete evidence that shows the step worked.
- "risks": side effects a reviewer must weigh, especially loss of forensic evidence and disruption to users or services. Prefer evidence-preserving steps first and say when a step may destroy evidence.
- "requiresApproval": always true.

Give at most 10 recommendations, most important first. If the record lacks information needed to act safely, do not guess: list what is missing in "informationNeeded" and state the assumptions you relied on in "assumptions".
"summary": two or three sentences on the overall approach and what is uncertain.

Masked values such as [EMAIL_1] or [SECRET_1] are intentional. Keep them exactly as written.

Return one json object with exactly these keys and no others, for example:
${JSON.stringify(EXAMPLE, null, 2)}`;

export function buildRemediationUserPrompt(sections: IncidentSections): string {
  return [
    "Propose remediation recommendations for the following incident record.",
    ...ANALYSIS_SOURCES.map((name) => wrapUntrusted(name, sections[name])),
    "Return the json object now.",
  ].join("\n");
}

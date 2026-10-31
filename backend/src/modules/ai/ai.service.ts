import { env } from "../../config/env.js";
import { findUnsupportedSpecifics, isGrounded } from "./ai.grounding.js";
import {
  reportDraftModelSchema,
  type MissingInformationSource,
  type ReportDraft,
  type ReportDraftResponse,
} from "./ai.schemas.js";
import { generateStructured, type StructuredCallMeta } from "./jsonCompletion.js";
import {
  REPORT_DRAFT_PROMPT_VERSION,
  REPORT_DRAFT_SYSTEM_PROMPT,
  buildReportDraftUserPrompt,
} from "./prompts/reportDraft.js";
import { getLlmProvider } from "./providers/deepseek.client.js";
import { redactText, type RedactionResult } from "./redaction.js";

export const AI_ADVISORY_NOTICE =
  "AI-generated draft. It may be incomplete or wrong. Review and edit every field before submitting.";

export interface PreparedReportDraft {
  redaction: RedactionResult;
  inputChars: number;
}

export interface ReportDraftRun {
  response: ReportDraftResponse;
  callMeta: StructuredCallMeta;
}

/** Redacts first so the controller can audit size and redaction counts even if the call later fails. */
export function prepareReportDraft(description: string): PreparedReportDraft {
  return {
    redaction: redactText(description, env.AI_MASK_IPS),
    inputChars: description.length,
  };
}

export async function runReportDraft(prepared: PreparedReportDraft): Promise<ReportDraftRun> {
  const { redaction } = prepared;
  const provider = getLlmProvider();

  const { data, meta } = await generateStructured({
    provider,
    system: REPORT_DRAFT_SYSTEM_PROMPT,
    user: buildReportDraftUserPrompt(redaction.text),
    schema: reportDraftModelSchema,
    maxTokens: 1800,
  });

  const warnings: string[] = [];

  // 1. Drop extracted items whose quote cannot be found in what the user wrote.
  const affectedAssets = data.affectedAssets.filter((a) =>
    isGrounded(a.name, a.sourceQuote, redaction.text)
  );
  const observedIndicators = data.observedIndicators.filter((i) =>
    isGrounded(i.indicator, i.sourceQuote, redaction.text)
  );
  const dropped =
    data.affectedAssets.length - affectedAssets.length +
    (data.observedIndicators.length - observedIndicators.length);
  if (dropped > 0) {
    warnings.push(
      `${dropped} suggested asset/indicator item(s) were removed because they could not be matched to your description.`
    );
  }

  // 2. Flag concrete specifics in the generated prose that the user never wrote.
  const unsupported = findUnsupportedSpecifics(
    [data.title, data.summary, data.description, data.suggestedSeverity.rationale],
    redaction.text
  );
  for (const token of unsupported) {
    warnings.push(
      `The draft mentions "${redaction.restore(token)}", which does not appear in your description. Remove it unless you can confirm it.`
    );
  }

  // 3. Tell the user when sensitive values were masked rather than silently hiding it.
  const maskedValueCount = Object.entries(redaction.counts).reduce(
    (sum, [type, n]) => (type === "EMAIL" || type === "PHONE" || type === "IP" ? sum : sum + (n ?? 0)),
    0
  );
  if (maskedValueCount > 0) {
    warnings.push(
      `${maskedValueCount} sensitive value(s) such as passwords, tokens or card numbers were masked before analysis and appear as placeholders. Do not put secrets in an incident report.`
    );
  }

  // 4. Deterministic gaps the model may have skipped.
  const missing: ReportDraft["missingInformation"] = data.missingInformation.map((m) => ({
    ...m,
    source: "AI" as MissingInformationSource,
  }));
  const mentions = (word: string) => missing.some((m) => m.field.toLowerCase().includes(word));
  if (affectedAssets.length === 0 && !mentions("asset") && !mentions("system")) {
    missing.push({
      field: "Affected assets",
      question: "Which systems, devices, accounts or data are affected?",
      source: "SYSTEM",
    });
  }
  if (observedIndicators.length === 0 && !mentions("indicator")) {
    missing.push({
      field: "Observed indicators",
      question: "Are there any concrete details such as sender addresses, file names, links or error messages?",
      source: "SYSTEM",
    });
  }

  // 5. Restore the user's own emails, phone numbers and IPs; secrets stay masked.
  const restore = (value: string) => redaction.restore(value);
  const draft: ReportDraft = {
    title: restore(data.title),
    summary: restore(data.summary),
    category: data.category,
    description: restore(data.description),
    affectedAssets: affectedAssets.map((a) => ({
      name: restore(a.name),
      sourceQuote: restore(a.sourceQuote),
    })),
    observedIndicators: observedIndicators.map((i) => ({
      indicator: restore(i.indicator),
      type: i.type,
      sourceQuote: restore(i.sourceQuote),
    })),
    suggestedSeverity: {
      level: data.suggestedSeverity.level,
      rationale: restore(data.suggestedSeverity.rationale),
    },
    missingInformation: missing.map((m) => ({
      ...m,
      field: restore(m.field),
      question: restore(m.question),
    })),
  };

  return {
    callMeta: meta,
    response: {
      draft,
      warnings,
      meta: {
        advisory: true,
        model: meta.model,
        promptVersion: REPORT_DRAFT_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        maskedValueCount,
        notice: AI_ADVISORY_NOTICE,
      },
    },
  };
}

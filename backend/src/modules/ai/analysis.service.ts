import { findUnsupportedSpecifics, isGrounded, quoteInSource } from "./ai.grounding.js";
import type { PreparedIncidentContext } from "./ai.incidentContext.js";
import {
  ANALYSIS_SOURCES,
  analysisModelSchema,
  type ConfidenceLevel,
  type IncidentAnalysis,
  type IncidentAnalysisResponse,
} from "./ai.schemas.js";
import { generateStructured, type StructuredCallMeta } from "./jsonCompletion.js";
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from "./prompts/analysis.js";
import { getLlmProvider } from "./providers/deepseek.client.js";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const ANALYSIS_NOTICE =
  "AI-generated analysis. It may be incomplete or wrong and is not a verified finding. Facts are quoted from the incident record; hypotheses are inferences. Verify before acting on anything here.";

export type PreparedAnalysis = PreparedIncidentContext;

export interface AnalysisRun {
  response: IncidentAnalysisResponse;
  callMeta: StructuredCallMeta;
}

export async function runAnalysis(prepared: PreparedAnalysis): Promise<AnalysisRun> {
  const { sections, redaction } = prepared;
  const provider = getLlmProvider();

  const { data, meta } = await generateStructured({
    provider,
    system: ANALYSIS_SYSTEM_PROMPT,
    user: buildAnalysisUserPrompt(sections),
    schema: analysisModelSchema,
    maxTokens: 3500,
  });

  const warnings: string[] = [];
  const allText = ANALYSIS_SOURCES.map((name) => sections[name]).join("\n");

  // 1. Facts must be quotable from the record. A wrong section label is corrected; an
  //    unquotable "fact" is removed, because it is really an inference or an invention.
  const seenIds = new Set<string>();
  const facts: IncidentAnalysis["observedFacts"] = [];
  let droppedFacts = 0;
  for (const fact of data.observedFacts) {
    if (seenIds.has(fact.id)) {
      droppedFacts++;
      continue;
    }
    let source = fact.source;
    if (!quoteInSource(fact.sourceQuote, sections[source])) {
      const actual = ANALYSIS_SOURCES.find((name) => quoteInSource(fact.sourceQuote, sections[name]));
      if (!actual) {
        droppedFacts++;
        continue;
      }
      source = actual;
    }
    seenIds.add(fact.id);
    facts.push({ id: fact.id, statement: fact.statement, source, sourceQuote: fact.sourceQuote });
  }
  if (droppedFacts > 0) {
    warnings.push(
      `${droppedFacts} claimed fact(s) were removed because their quotes could not be found in the incident record.`
    );
  }

  const indicators = data.indicators.filter((i) => isGrounded(i.indicator, i.sourceQuote, allText));
  const droppedIndicators = data.indicators.length - indicators.length;
  if (droppedIndicators > 0) {
    warnings.push(
      `${droppedIndicators} suggested indicator(s) were removed because they could not be matched to the incident record.`
    );
  }

  // 2. Hypotheses are inferences. Their confidence cannot exceed what their cited facts justify.
  const keepValidIds = (ids: string[]) => [...new Set(ids)].filter((id) => seenIds.has(id));
  let lowered = 0;
  const hypotheses: IncidentAnalysis["hypotheses"] = data.hypotheses.map((h) => {
    const supportingFactIds = keepValidIds(h.supportingFactIds);
    let confidence = h.confidence;
    let confidenceNote: string | null = null;

    if (supportingFactIds.length === 0) {
      if (confidence !== "LOW") {
        confidence = "LOW";
        lowered++;
      }
      confidenceNote = "No supporting facts from the record were cited. Treat this as speculation.";
    } else if (confidence === "HIGH" && supportingFactIds.length < 2) {
      confidence = "MEDIUM";
      confidenceNote = "Confidence lowered from HIGH: fewer than two supporting facts.";
      lowered++;
    }
    return {
      id: h.id,
      category: h.category,
      statement: h.statement,
      confidence,
      confidenceNote,
      reasoning: h.reasoning,
      supportingFactIds,
      howToVerify: h.howToVerify,
    };
  });
  hypotheses.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
  if (lowered > 0) {
    warnings.push(
      `${lowered} hypothesis confidence level(s) were lowered because the cited facts did not justify them.`
    );
  }

  const suspiciousPatterns = data.suspiciousPatterns.map((p) => ({
    ...p,
    supportingFactIds: keepValidIds(p.supportingFactIds),
  }));

  // 3. Concrete specifics (IPs, hashes, CVEs, URLs) in the AI's prose must exist in the record.
  const unsupported = findUnsupportedSpecifics(
    [
      data.summary,
      ...facts.map((f) => f.statement),
      ...hypotheses.flatMap((h) => [h.statement, h.reasoning, h.howToVerify]),
      ...suspiciousPatterns.flatMap((p) => [p.pattern, p.explanation]),
      ...data.missingEvidence.flatMap((m) => [m.item, m.whyItMatters]),
    ],
    allText
  );
  for (const token of unsupported) {
    warnings.push(
      `The analysis mentions "${redaction.restore(token)}", which does not appear in the incident record. Verify it before relying on it.`
    );
  }

  const maskedValueCount = Object.entries(redaction.counts).reduce(
    (sum, [type, n]) => (type === "EMAIL" || type === "PHONE" || type === "IP" ? sum : sum + (n ?? 0)),
    0
  );
  if (maskedValueCount > 0) {
    warnings.push(
      `${maskedValueCount} sensitive value(s) in the incident record were masked before analysis and appear as placeholders.`
    );
  }

  // 4. Restore the record's own emails, phone numbers and IPs for the authorised reader.
  const restore = (value: string) => redaction.restore(value);
  const analysis: IncidentAnalysis = {
    summary: restore(data.summary),
    observedFacts: facts.map((f) => ({
      ...f,
      statement: restore(f.statement),
      sourceQuote: restore(f.sourceQuote),
    })),
    indicators: indicators.map((i) => ({
      ...i,
      indicator: restore(i.indicator),
      sourceQuote: restore(i.sourceQuote),
    })),
    hypotheses: hypotheses.map((h) => ({
      ...h,
      statement: restore(h.statement),
      reasoning: restore(h.reasoning),
      howToVerify: restore(h.howToVerify),
    })),
    suspiciousPatterns: suspiciousPatterns.map((p) => ({
      ...p,
      pattern: restore(p.pattern),
      explanation: restore(p.explanation),
    })),
    missingEvidence: data.missingEvidence.map((m) => ({
      item: restore(m.item),
      whyItMatters: restore(m.whyItMatters),
    })),
  };

  return {
    callMeta: meta,
    response: {
      incident: { id: prepared.incident.id, incidentNumber: prepared.incident.incidentNumber },
      analysis,
      warnings,
      meta: {
        advisory: true,
        model: meta.model,
        promptVersion: ANALYSIS_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        incidentUpdatedAt: prepared.incident.updatedAt.toISOString(),
        historyEntriesConsidered: prepared.historyEntries,
        hasInvestigation: prepared.hasInvestigation,
        notice: ANALYSIS_NOTICE,
      },
    },
  };
}

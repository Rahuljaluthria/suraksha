import { findUnsupportedSpecifics, quoteInSource } from "./ai.grounding.js";
import type { PreparedIncidentContext } from "./ai.incidentContext.js";
import { detectRiskFlags } from "./ai.riskFlags.js";
import {
  ANALYSIS_SOURCES,
  remediationModelSchema,
  type RemediationPlanResponse,
  type RemediationPriority,
  type RemediationRecommendation,
} from "./ai.schemas.js";
import { generateStructured, type StructuredCallMeta } from "./jsonCompletion.js";
import {
  REMEDIATION_PROMPT_VERSION,
  REMEDIATION_SYSTEM_PROMPT,
  buildRemediationUserPrompt,
} from "./prompts/remediation.js";
import { getLlmProvider } from "./providers/deepseek.client.js";

export type PreparedRemediation = PreparedIncidentContext;

export interface RemediationRun {
  response: RemediationPlanResponse;
  callMeta: StructuredCallMeta;
}

const REMEDIATION_NOTICE =
  "AI-generated suggestions for review. Nothing here is executed or applied by Suraksha. Each step needs a person to review, approve and carry it out through your normal change process.";

const PRIORITY_ORDER: Record<RemediationPriority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

export async function runRemediation(prepared: PreparedRemediation): Promise<RemediationRun> {
  const { sections, redaction } = prepared;
  const provider = getLlmProvider();

  const { data, meta } = await generateStructured({
    provider,
    system: REMEDIATION_SYSTEM_PROMPT,
    user: buildRemediationUserPrompt(sections),
    schema: remediationModelSchema,
    maxTokens: 3500,
  });

  const allText = ANALYSIS_SOURCES.map((name) => sections[name]).join("\n");
  const allTextLower = allText.toLowerCase();
  const warnings: string[] = [];
  const severityAllowsP1 = prepared.incident.severity === "HIGH" || prepared.incident.severity === "CRITICAL";

  let priorityLowered = 0;
  let unverifiedEvidence = 0;
  let droppedTargets = 0;
  const seenIds = new Set<string>();

  const recommendations: RemediationRecommendation[] = [];
  for (const rec of data.recommendations) {
    if (seenIds.has(rec.id)) continue;
    seenIds.add(rec.id);

    // The AI's priority is a suggestion. P1 is reserved for high-severity incidents.
    let priority = rec.priority;
    let priorityNote: string | null = null;
    if (priority === "P1" && !severityAllowsP1) {
      priority = "P2";
      priorityNote = `Lowered from P1: the incident's recorded severity is ${prepared.incident.severity}.`;
      priorityLowered++;
    }

    // Assets must be named in the record; otherwise they are unverified and removed.
    const targetAssets = rec.targetAssets.filter((name) => allTextLower.includes(name.toLowerCase()));
    droppedTargets += rec.targetAssets.length - targetAssets.length;

    // A recommendation stays visible without evidence, but is labelled as untied to the record.
    const evidenceVerified = rec.sourceQuote.length > 0 && quoteInSource(rec.sourceQuote, allText);
    if (!evidenceVerified) unverifiedEvidence++;

    const texts = [rec.action, rec.rationale, rec.expectedOutcome, rec.verification, rec.risks];
    const unverifiedDetails = findUnsupportedSpecifics(texts, allText).map(redaction.restore);

    recommendations.push({
      id: rec.id,
      action: redaction.restore(rec.action),
      priority,
      priorityNote,
      phase: rec.phase,
      rationale: redaction.restore(rec.rationale),
      evidenceQuote: evidenceVerified ? redaction.restore(rec.sourceQuote) : null,
      evidenceVerified,
      targetAssets: targetAssets.map(redaction.restore),
      expectedOutcome: redaction.restore(rec.expectedOutcome),
      verification: redaction.restore(rec.verification),
      risks: redaction.restore(rec.risks),
      riskFlags: detectRiskFlags(rec.action, rec.expectedOutcome, rec.risks),
      unverifiedDetails,
      requiresApproval: true,
    });
  }

  // Stable sort: most urgent first, otherwise the model's own order.
  recommendations.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  if (priorityLowered > 0) {
    warnings.push(
      `${priorityLowered} recommendation(s) had their priority lowered from P1 because the incident's recorded severity is ${prepared.incident.severity}.`
    );
  }
  if (unverifiedEvidence > 0) {
    warnings.push(
      `${unverifiedEvidence} recommendation(s) are not tied to a verifiable quote from the incident record. Treat them as general advice.`
    );
  }
  if (droppedTargets > 0) {
    warnings.push(
      `${droppedTargets} named asset(s) were removed because they do not appear in the incident record.`
    );
  }
  const withUnverified = recommendations.filter((r) => r.unverifiedDetails.length > 0).length;
  if (withUnverified > 0) {
    warnings.push(
      `${withUnverified} recommendation(s) mention IP addresses, hostnames, domains, hashes, URLs or CVEs that are not in the incident record. Check them before acting.`
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

  return {
    callMeta: meta,
    response: {
      incident: {
        id: prepared.incident.id,
        incidentNumber: prepared.incident.incidentNumber,
        severity: prepared.incident.severity,
        status: prepared.incident.status,
      },
      plan: {
        summary: redaction.restore(data.summary),
        recommendations,
        assumptions: data.assumptions.map(redaction.restore),
        informationNeeded: data.informationNeeded.map(redaction.restore),
      },
      warnings,
      meta: {
        advisory: true,
        requiresHumanApproval: true,
        model: meta.model,
        promptVersion: REMEDIATION_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        incidentUpdatedAt: prepared.incident.updatedAt.toISOString(),
        notice: REMEDIATION_NOTICE,
      },
    },
  };
}

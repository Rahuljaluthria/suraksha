import type { Request, Response } from "express";
import { AiError, AiRateLimitedError } from "./ai.errors.js";
import { auditAiCall } from "./ai.audit.js";
import type { ReportDraftRequest } from "./ai.schemas.js";
import { prepareReportDraft, runReportDraft } from "./ai.service.js";
import { env } from "../../config/env.js";
import { prepareIncidentContext, type PreparedIncidentContext } from "./ai.incidentContext.js";
import { runAnalysis } from "./analysis.service.js";
import { runRemediation } from "./remediation.service.js";
import type { StructuredCallMeta } from "./jsonCompletion.js";
import { ANALYSIS_PROMPT_VERSION } from "./prompts/analysis.js";
import { REMEDIATION_PROMPT_VERSION } from "./prompts/remediation.js";
import { REPORT_DRAFT_PROMPT_VERSION } from "./prompts/reportDraft.js";
import { isAiConfigured } from "./providers/deepseek.client.js";
import { getIncidentById, ForbiddenOperationError, IncidentNotFoundError } from "../incidents/incident.service.js";

/** Shared by every AI handler: maps typed AI and incident-access errors to consistent HTTP responses. */
export function handleAiError(error: unknown, res: Response): void {
  if (error instanceof IncidentNotFoundError) {
    res.status(404).json({ success: false, code: error.code, message: error.message });
    return;
  }

  if (error instanceof ForbiddenOperationError) {
    res.status(403).json({ success: false, code: error.code, message: error.message });
    return;
  }

  if (error instanceof AiError) {
    if (error instanceof AiRateLimitedError && error.retryAfterSeconds) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    res.status(error.httpStatus).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error("[AI] Unhandled error:", error);
  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "An internal server error occurred while processing the AI request",
  });
}

/**
 * POST /api/ai/report-draft
 * Turns a free-text description into a structured, reviewable incident report draft.
 * Stateless: nothing is saved. The employee reviews it and submits through the
 * normal POST /api/incidents.
 */
export async function reportDraftHandler(req: Request, res: Response): Promise<void> {
  const { description } = req.body as ReportDraftRequest;
  const prepared = prepareReportDraft(description);
  const auditBase = {
    req,
    feature: "REPORT_DRAFT" as const,
    promptVersion: REPORT_DRAFT_PROMPT_VERSION,
    inputChars: prepared.inputChars,
    redactions: prepared.redaction.counts,
  };

  try {
    const { response, callMeta } = await runReportDraft(prepared);
    await auditAiCall({ ...auditBase, meta: callMeta });
    res.status(200).json({ success: true, data: response });
  } catch (error) {
    await auditAiCall({ ...auditBase, error });
    handleAiError(error, res);
  }
}

/**
 * Shared flow for features that work on an existing incident: check the caller may read it
 * (same rules as GET /incidents/:id), build the redacted allowlisted view, call the model,
 * and audit the outcome, including denied and failed attempts. Stateless.
 */
async function handleIncidentAiRequest(
  req: Request,
  res: Response,
  feature: { name: "INCIDENT_ANALYSIS" | "REMEDIATION_SUGGESTIONS"; promptVersion: string },
  run: (prepared: PreparedIncidentContext) => Promise<{ response: unknown; callMeta: StructuredCallMeta }>
): Promise<void> {
  const incidentId = String(req.params.id);
  const auditBase = {
    req,
    feature: feature.name,
    promptVersion: feature.promptVersion,
    incidentId,
  };

  let inputChars = 0;
  let redactions = {};

  try {
    // Throws IncidentNotFoundError / ForbiddenOperationError exactly as GET /incidents/:id would.
    const incident = await getIncidentById(req.user!, incidentId);
    const prepared = prepareIncidentContext(incident, env.AI_MASK_IPS);
    inputChars = prepared.inputChars;
    redactions = prepared.redaction.counts;

    const { response, callMeta } = await run(prepared);
    await auditAiCall({ ...auditBase, inputChars, redactions, meta: callMeta });
    res.status(200).json({ success: true, data: response });
  } catch (error) {
    await auditAiCall({ ...auditBase, inputChars, redactions, error });
    handleAiError(error, res);
  }
}

/**
 * POST /api/ai/incidents/:id/analysis
 * Analyses one existing incident. Requires `ai:analyze` plus read access to the incident.
 */
export function analyzeIncidentHandler(req: Request, res: Response): Promise<void> {
  return handleIncidentAiRequest(
    req,
    res,
    { name: "INCIDENT_ANALYSIS", promptVersion: ANALYSIS_PROMPT_VERSION },
    runAnalysis
  );
}

/**
 * POST /api/ai/incidents/:id/remediation
 * Suggests prioritised remediation steps for human review. Requires `ai:recommend` plus read
 * access to the incident. Suggestions only: nothing is executed, saved or applied.
 */
export function recommendRemediationHandler(req: Request, res: Response): Promise<void> {
  return handleIncidentAiRequest(
    req,
    res,
    { name: "REMEDIATION_SUGGESTIONS", promptVersion: REMEDIATION_PROMPT_VERSION },
    runRemediation
  );
}

/**
 * GET /api/ai/status
 * Lets the UI decide which AI controls to show: whether AI is available at all,
 * and which features this user's permissions allow.
 */
export function getAiStatusHandler(req: Request, res: Response): void {
  const user = req.user!;
  res.status(200).json({
    success: true,
    data: {
      available: isAiConfigured(),
      features: {
        draftReport: user.hasPermission("ai:draft_report"),
        analyze: user.hasPermission("ai:analyze"),
        recommend: user.hasPermission("ai:recommend"),
      },
    },
  });
}

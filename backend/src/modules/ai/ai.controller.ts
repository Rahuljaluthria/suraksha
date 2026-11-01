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
import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { stageOutboxEvent, triggerOutboxDispatch } from "../../services/outbox.service.js";
import { EVENT_VERSION, TOPICS } from "../../events/eventTypes.js";
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
  const auditBase = {
    req,
    feature: "REPORT_DRAFT" as const,
    promptVersion: REPORT_DRAFT_PROMPT_VERSION,
    inputChars: description.length,
    redactions: {},
  };

  try {
    // Inside the try so that a failure while redacting is audited and answered with a clean 500
    // instead of reaching the framework's default error page.
    const prepared = prepareReportDraft(description);
    auditBase.redactions = prepared.redaction.counts;
    const { response, callMeta } = await runReportDraft(prepared);
    await auditAiCall({ ...auditBase, meta: callMeta });

    try {
      await stageOutboxEvent(prisma, {
        eventId: `evt_${crypto.randomUUID()}`,
        version: EVENT_VERSION,
        eventType: "AI_REPORT_GENERATED",
        topic: TOPICS.INCIDENT_EVENTS,
        timestamp: new Date().toISOString(),
        producer: "suraksha-backend",
        aggregateType: "AI",
        aggregateId: req.user?.id || "anonymous",
        actorId: req.user?.id,
        data: {
          inputChars: auditBase.inputChars,
          redactionCounts: auditBase.redactions,
          promptVersion: auditBase.promptVersion,
          suggestedCategory: response.draft.category,
          suggestedSeverity: response.draft.suggestedSeverity.level,
        },
      });
      triggerOutboxDispatch();
    } catch (outboxErr) {
      console.warn("[AI] Non-blocking outbox event error for report draft:", outboxErr);
    }

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
    // audit_log.entityId is VarChar(191); never let a hostile path segment break the audit write.
    incidentId: incidentId.slice(0, 191),
  };

  let inputChars = 0;
  let redactions = {};

  try {
    if (incidentId.length === 0 || incidentId.length > 191) {
      throw new IncidentNotFoundError();
    }

    // Throws IncidentNotFoundError / ForbiddenOperationError exactly as GET /incidents/:id would.
    const incident = await getIncidentById(req.user!, incidentId);
    const prepared = prepareIncidentContext(incident, env.AI_MASK_IPS);
    inputChars = prepared.inputChars;
    redactions = prepared.redaction.counts;

    const { response, callMeta } = await run(prepared);
    await auditAiCall({ ...auditBase, inputChars, redactions, meta: callMeta });

    try {
      if (feature.name === "INCIDENT_ANALYSIS") {
        const analysisData = response as any;
        await stageOutboxEvent(prisma, {
          eventId: `evt_${crypto.randomUUID()}`,
          version: EVENT_VERSION,
          eventType: "AI_ANALYSIS_COMPLETED",
          topic: TOPICS.INCIDENT_EVENTS,
          timestamp: new Date().toISOString(),
          producer: "suraksha-backend",
          aggregateType: "AI",
          aggregateId: incidentId,
          actorId: req.user?.id,
          data: {
            incidentId,
            incidentNumber: incident.incidentNumber,
            actorId: req.user?.id,
            promptVersion: feature.promptVersion,
            factsCount: analysisData.observedFacts?.length || 0,
            hypothesesCount: analysisData.hypotheses?.length || 0,
            confidence: analysisData.confidenceLevel,
          },
        });
        triggerOutboxDispatch();
      } else if (feature.name === "REMEDIATION_SUGGESTIONS") {
        const remData = response as any;
        await stageOutboxEvent(prisma, {
          eventId: `evt_${crypto.randomUUID()}`,
          version: EVENT_VERSION,
          eventType: "REMEDIATION_SUGGESTIONS_GENERATED",
          topic: TOPICS.INCIDENT_EVENTS,
          timestamp: new Date().toISOString(),
          producer: "suraksha-backend",
          aggregateType: "AI",
          aggregateId: incidentId,
          actorId: req.user?.id,
          data: {
            incidentId,
            incidentNumber: incident.incidentNumber,
            actorId: req.user?.id,
            promptVersion: feature.promptVersion,
            recommendationsCount: remData.recommendations?.length || 0,
            riskFlags: remData.riskFlags || [],
          },
        });
        triggerOutboxDispatch();
      }
    } catch (outboxErr) {
      console.warn(`[AI] Non-blocking outbox event error for ${feature.name}:`, outboxErr);
    }

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

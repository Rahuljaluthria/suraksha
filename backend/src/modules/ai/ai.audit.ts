import type { Request } from "express";
import { createAuditLog } from "../../utils/audit.js";
import { AiError, AiInvalidResponseError, AiUpstreamError } from "./ai.errors.js";
import type { StructuredCallMeta } from "./jsonCompletion.js";
import type { RedactionType } from "./redaction.js";

export type AiFeature = "REPORT_DRAFT" | "INCIDENT_ANALYSIS" | "REMEDIATION_SUGGESTIONS";

export interface AiAuditInput {
  req: Request;
  feature: AiFeature;
  promptVersion: string;
  incidentId?: string;
  inputChars: number;
  redactions: Partial<Record<RedactionType, number>>;
  meta?: StructuredCallMeta;
  error?: unknown;
}

/**
 * Records that an AI call happened, who made it, and how it went. Metadata only:
 * prompts, incident text and model output are never stored.
 */
export async function auditAiCall(input: AiAuditInput): Promise<void> {
  const { req, feature, error, meta } = input;

  await createAuditLog({
    actorId: req.user?.id,
    action: `AI_${feature}`,
    entityType: input.incidentId ? "Incident" : undefined,
    entityId: input.incidentId,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      outcome: error ? "FAILED" : "SUCCESS",
      promptVersion: input.promptVersion,
      inputChars: input.inputChars,
      redactions: input.redactions,
      ...(meta && {
        provider: meta.provider,
        model: meta.model,
        attempts: meta.attempts,
        latencyMs: meta.latencyMs,
        usage: JSON.parse(JSON.stringify(meta.usage)) as Record<string, number>,
      }),
      ...(error !== undefined && {
        errorCode:
          error instanceof AiError
            ? error.code
            : typeof (error as { code?: unknown })?.code === "string"
              ? (error as { code: string }).code
              : "UNKNOWN",
        ...(error instanceof AiUpstreamError && error.upstreamStatus !== undefined
          ? { upstreamStatus: error.upstreamStatus }
          : {}),
        ...(error instanceof AiInvalidResponseError ? { invalidReason: error.reason } : {}),
      }),
    },
  });
}

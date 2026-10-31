import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { aiLimiter } from "../../middleware/rateLimit.js";
import {
  analyzeIncidentHandler,
  getAiStatusHandler,
  recommendRemediationHandler,
  reportDraftHandler,
} from "./ai.controller.js";
import { reportDraftRequestSchema } from "./ai.schemas.js";

const router = Router();

// All AI endpoints require valid authentication
router.use(requireAuth);

/**
 * GET /api/ai/status
 * AI availability and the caller's AI permissions. Not rate limited by the AI
 * limiter because it never reaches the provider.
 */
router.get("/status", getAiStatusHandler);

/**
 * POST /api/ai/report-draft
 * Feature 1: draft a structured incident report. Requires `ai:draft_report`.
 */
router.post(
  "/report-draft",
  aiLimiter,
  requirePermission("ai:draft_report"),
  validateBody(reportDraftRequestSchema),
  reportDraftHandler
);

/**
 * POST /api/ai/incidents/:id/analysis
 * Feature 2: analyse an incident the caller can read. Requires `ai:analyze`.
 */
router.post(
  "/incidents/:id/analysis",
  aiLimiter,
  requirePermission("ai:analyze"),
  analyzeIncidentHandler
);

/**
 * POST /api/ai/incidents/:id/remediation
 * Feature 3: prioritised remediation suggestions for human review. Requires `ai:recommend`.
 * Suggestions only; there is no code path that executes or applies them.
 */
router.post(
  "/incidents/:id/remediation",
  aiLimiter,
  requirePermission("ai:recommend"),
  recommendRemediationHandler
);

export default router;

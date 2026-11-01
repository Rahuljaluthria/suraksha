import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/rbac.js";
import { validateQuery } from "../../middleware/validate.js";
import { getSecurityActivity } from "./security.service.js";

const router = Router();

const activityQuerySchema = z.object({
  hours: z.coerce.number().int().refine((h) => [6, 24, 72].includes(h), "hours must be 6, 24 or 72").optional().default(24),
});

router.use(requireAuth);

/**
 * GET /api/security/activity
 * Time-bucketed counts of authentication and access events from the audit log, with simple,
 * documented signals (failed-login bursts, lockouts, token reuse). Aggregates only: no emails,
 * IP addresses or user ids leave this endpoint. Requires `audit:read`.
 */
router.get(
  "/activity",
  requirePermission("audit:read"),
  validateQuery(activityQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { hours } = (req as Request & { validatedQuery: z.infer<typeof activityQuerySchema> }).validatedQuery;
      res.status(200).json({ success: true, data: await getSecurityActivity(hours) });
    } catch (error) {
      console.error("[Security] Failed to aggregate security activity:", error);
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not load security activity",
      });
    }
  }
);

export default router;

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSystemHealth } from "./health.service.js";

const router = Router();

/**
 * GET /api/health/details
 * Real MySQL, Redis, Kafka and event-pipeline status for signed-in users. The public
 * GET /api/health stays a cheap liveness probe. Results are cached for ten seconds.
 */
router.get("/", requireAuth, async (_req, res) => {
  try {
    res.status(200).json({ success: true, data: await getSystemHealth() });
  } catch (error) {
    console.error("[Health] Unexpected failure while checking dependencies:", error);
    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not determine system health",
    });
  }
});

export default router;

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/rbac.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { incidentMutationLimiter } from "../../middleware/rateLimit.js";
import {
  createIncidentSchema,
  updateIncidentSchema,
  changeStatusSchema,
  assignIncidentSchema,
  queryIncidentsSchema,
} from "./incident.schemas.js";
import {
  createIncidentHandler,
  listIncidentsHandler,
  getIncidentHandler,
  updateIncidentHandler,
  changeStatusHandler,
  assignIncidentHandler,
} from "./incident.controller.js";

const router = Router();

// All incident endpoints require valid authentication
router.use(requireAuth);

/**
 * POST /api/incidents
 * Report a new incident. Requires `incident:create` permission.
 */
router.post(
  "/",
  incidentMutationLimiter,
  requirePermission("incident:create"),
  validateBody(createIncidentSchema),
  createIncidentHandler
);

/**
 * GET /api/incidents
 * List incidents scoped by user permissions (universal, assigned, or own).
 */
router.get(
  "/",
  requirePermission("incident:read:all", "incident:read:assigned", "incident:read:own"),
  validateQuery(queryIncidentsSchema),
  listIncidentsHandler
);

/**
 * GET /api/incidents/:id
 * Retrieve single incident details with resource-level authorization.
 */
router.get(
  "/:id",
  requirePermission("incident:read:all", "incident:read:assigned", "incident:read:own"),
  getIncidentHandler
);

/**
 * PATCH /api/incidents/:id
 * Update incident details (title, description, severity, priority, category).
 */
router.patch(
  "/:id",
  incidentMutationLimiter,
  requirePermission("incident:update", "incident:assess"),
  validateBody(updateIncidentSchema),
  updateIncidentHandler
);

/**
 * POST /api/incidents/:id/status
 * Transition incident lifecycle state.
 */
router.post(
  "/:id/status",
  incidentMutationLimiter,
  requirePermission(
    "incident:update",
    "incident:assess",
    "incident:escalate",
    "incident:close"
  ),
  validateBody(changeStatusSchema),
  changeStatusHandler
);

/**
 * POST /api/incidents/:id/assign
 * Assign or reassign incident to a responder. Requires `incident:assign` (INCIDENT_COMMANDER).
 */
router.post(
  "/:id/assign",
  incidentMutationLimiter,
  requirePermission("incident:assign"),
  validateBody(assignIncidentSchema),
  assignIncidentHandler
);

export default router;

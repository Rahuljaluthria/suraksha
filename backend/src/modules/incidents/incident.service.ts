import { prisma } from "../../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus,
} from "../../generated/prisma/enums.js";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import { authorizeResourceAccess } from "../../utils/resourceAuth.js";
import { createAuditLog } from "../../utils/audit.js";
import crypto from "node:crypto";
import { publishIncidentEvent } from "../../services/incidentEvent.service.js";
import { stageOutboxEvent, triggerOutboxDispatch } from "../../services/outbox.service.js";
import { EVENT_VERSION, TOPICS } from "../../events/eventTypes.js";
import type {
  CreateIncidentInput,
  UpdateIncidentInput,
  ChangeStatusInput,
  AssignIncidentInput,
  QueryIncidentsInput,
} from "./incident.schemas.js";

// Custom error types for predictable HTTP status mapping
export class IncidentNotFoundError extends Error {
  readonly code = "INCIDENT_NOT_FOUND";
  constructor(message = "Incident not found") {
    super(message);
    this.name = "IncidentNotFoundError";
  }
}

export class ForbiddenOperationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Access denied: insufficient permissions") {
    super(message);
    this.name = "ForbiddenOperationError";
  }
}

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_LIFECYCLE_TRANSITION";
  constructor(fromStatus: IncidentStatus, toStatus: IncidentStatus) {
    super(`Cannot transition incident from ${fromStatus} to ${toStatus}`);
    this.name = "InvalidTransitionError";
  }
}

export class BadRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BadRequestError";
  }
}

/**
 * Valid lifecycle transitions state machine
 */
export const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  NEW: ["TRIAGED", "ASSIGNED", "REJECTED"],
  TRIAGED: ["ASSIGNED", "REJECTED", "INVESTIGATING"],
  ASSIGNED: ["INVESTIGATING", "ESCALATED", "TRIAGED"],
  INVESTIGATING: ["REMEDIATING", "ESCALATED", "ASSIGNED", "RESOLVED"],
  REMEDIATING: ["VERIFYING", "INVESTIGATING", "ESCALATED"],
  VERIFYING: ["RESOLVED", "REMEDIATING", "INVESTIGATING"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REJECTED: ["REOPENED"],
  ESCALATED: ["INVESTIGATING", "REMEDIATING", "ASSIGNED"],
  REOPENED: ["TRIAGED", "ASSIGNED", "INVESTIGATING"],
};

/**
 * Generates a unique, sequential human-readable incident number (e.g. INC-2026-0001).
 */
async function generateIncidentNumber(tx: Prisma.TransactionClient): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `INC-${currentYear}-`;

  const count = await tx.incident.count({
    where: {
      createdAt: {
        gte: new Date(`${currentYear}-01-01T00:00:00.000Z`),
      },
    },
  });

  const nextSeq = String(count + 1).padStart(4, "0");
  const candidate = `${prefix}${nextSeq}`;

  // Verify uniqueness (in case of concurrent generation)
  const existing = await tx.incident.findUnique({
    where: { incidentNumber: candidate },
    select: { id: true },
  });

  if (!existing) {
    return candidate;
  }

  // Fallback random suffix if sequence has collision
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${nextSeq}-${randomSuffix}`;
}

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Creates a new incident.
 * Enforces `incident:create` permission and starts in `NEW` status.
 */
export async function createIncident(
  user: AuthenticatedUser,
  input: CreateIncidentInput,
  meta: RequestMeta = {}
) {
  if (!user.hasPermission("incident:create")) {
    throw new ForbiddenOperationError("Missing incident:create permission");
  }

  const incident = await prisma.$transaction(async (tx) => {
    const incidentNumber = await generateIncidentNumber(tx);

    const newIncident = await tx.incident.create({
      data: {
        incidentNumber,
        title: input.title,
        description: input.description,
        severity: input.severity as IncidentSeverity,
        priority: input.priority as IncidentPriority,
        category: input.category,
        tags: input.tags ? (input.tags as Prisma.InputJsonValue) : undefined,
        status: IncidentStatus.NEW,
        reportedById: user.id,
      },
      include: {
        reportedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await tx.incidentHistory.create({
      data: {
        incidentId: newIncident.id,
        actorId: user.id,
        action: "CREATED",
        fromStatus: null,
        toStatus: IncidentStatus.NEW,
        notes: "Incident reported",
        metadata: {
          initialSeverity: input.severity,
          initialPriority: input.priority,
          category: input.category,
        },
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        action: "INCIDENT_CREATED",
        entityType: "Incident",
        entityId: newIncident.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          incidentNumber: newIncident.incidentNumber,
          severity: newIncident.severity,
        },
      },
      tx
    );

    await stageOutboxEvent(tx, {
      eventId: `evt_${crypto.randomUUID()}`,
      version: EVENT_VERSION,
      eventType: "INCIDENT_CREATED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: newIncident.id,
      actorId: user.id,
      data: {
        incidentId: newIncident.id,
        incidentNumber: newIncident.incidentNumber,
        title: newIncident.title,
        severity: newIncident.severity,
        priority: newIncident.priority,
        status: newIncident.status,
        category: newIncident.category,
        reportedById: user.id,
        reportedByEmail: user.email,
      },
    });

    return newIncident;
  });

  triggerOutboxDispatch();

  // Publish to Kafka topic asynchronously (non-blocking)
  await publishIncidentEvent({
    eventType: "INCIDENT_CREATED",
    incidentId: incident.id,
    incidentNumber: incident.incidentNumber,
    actorId: user.id,
    timestamp: new Date().toISOString(),
    data: {
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
    },
  });

  return incident;
}

/**
 * Lists incidents with role/resource scoping, filtering, sorting, and pagination.
 */
export async function listIncidents(
  user: AuthenticatedUser,
  query: QueryIncidentsInput
) {
  // Determine query scope based on user's permissions
  const hasUniversalRead = user.hasPermission("incident:read:all");
  const hasAssignedRead = user.hasPermission("incident:read:assigned");
  const hasOwnRead = user.hasPermission("incident:read:own");

  if (!hasUniversalRead && !hasAssignedRead && !hasOwnRead) {
    throw new ForbiddenOperationError(
      "You do not have permission to view incidents"
    );
  }

  const whereConditions: Prisma.IncidentWhereInput[] = [];

  // Scope constraints
  if (!hasUniversalRead) {
    if (hasAssignedRead && hasOwnRead) {
      whereConditions.push({
        OR: [
          { reportedById: user.id },
          { assignedToId: user.id },
          { assignments: { some: { userId: user.id, isActive: true } } },
        ],
      });
    } else if (hasAssignedRead) {
      whereConditions.push({
        OR: [
          { assignedToId: user.id },
          { assignments: { some: { userId: user.id, isActive: true } } },
        ],
      });
    } else if (hasOwnRead) {
      whereConditions.push({ reportedById: user.id });
    }
  }

  // Filter conditions
  if (query.status) {
    whereConditions.push({ status: query.status as IncidentStatus });
  }
  if (query.severity) {
    whereConditions.push({ severity: query.severity as IncidentSeverity });
  }
  if (query.priority) {
    whereConditions.push({ priority: query.priority as IncidentPriority });
  }
  if (query.category) {
    whereConditions.push({ category: { contains: query.category } });
  }
  if (query.search) {
    whereConditions.push({
      OR: [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
        { incidentNumber: { contains: query.search } },
      ],
    });
  }

  const where: Prisma.IncidentWhereInput =
    whereConditions.length > 0 ? { AND: whereConditions } : {};

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, incidents] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        reportedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignments: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    incidents,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Retrieves incident details with strict resource-level authorization.
 */
export async function getIncidentById(user: AuthenticatedUser, incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      reportedBy: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      assignedTo: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      assignments: {
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          assignedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
      history: {
        include: {
          actor: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      investigation: {
        include: {
          lead: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!incident) {
    throw new IncidentNotFoundError();
  }

  // Resource-level authorization
  const assigneeIds = [
    incident.assignedToId,
    ...incident.assignments.filter((a) => a.isActive).map((a) => a.userId),
  ].filter(Boolean);

  const authResult = authorizeResourceAccess(user, {
    actionPrefix: "incident:read",
    ownerId: incident.reportedById,
    assigneeIds,
    isWriteAction: false,
  });

  if (!authResult.allowed) {
    throw new ForbiddenOperationError(authResult.reason);
  }

  return incident;
}

/**
 * Updates incident properties (title, description, severity, priority, category, tags).
 */
export async function updateIncident(
  user: AuthenticatedUser,
  incidentId: string,
  input: UpdateIncidentInput,
  meta: RequestMeta = {}
) {
  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { assignments: { where: { isActive: true } } },
  });

  if (!existing) {
    throw new IncidentNotFoundError();
  }

  const assigneeIds = [
    existing.assignedToId,
    ...existing.assignments.map((a) => a.userId),
  ].filter(Boolean);

  const authResult = authorizeResourceAccess(user, {
    actionPrefix: "incident:update",
    ownerId: existing.reportedById,
    assigneeIds,
    isWriteAction: true,
  });

  if (!authResult.allowed) {
    throw new ForbiddenOperationError(authResult.reason);
  }

  // Severity/Priority classification requires incident:assess or incident:update
  const isModifyingClassification =
    input.severity !== undefined || input.priority !== undefined;

  if (
    isModifyingClassification &&
    !user.hasPermission("incident:assess") &&
    !user.hasPermission("incident:update")
  ) {
    throw new ForbiddenOperationError(
      "Missing incident:assess or incident:update permission to modify classification"
    );
  }

  const updatedIncident = await prisma.$transaction(async (tx) => {
    const updated = await tx.incident.update({
      where: { id: incidentId },
      data: {
        title: input.title,
        description: input.description,
        severity: input.severity as IncidentSeverity | undefined,
        priority: input.priority as IncidentPriority | undefined,
        category: input.category,
        tags: input.tags ? (input.tags as Prisma.InputJsonValue) : undefined,
      },
      include: {
        reportedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    const changedFields: Record<string, unknown> = {};
    if (input.title && input.title !== existing.title) changedFields.title = input.title;
    if (input.severity && input.severity !== existing.severity) {
      changedFields.severity = { from: existing.severity, to: input.severity };
    }
    if (input.priority && input.priority !== existing.priority) {
      changedFields.priority = { from: existing.priority, to: input.priority };
    }
    if (input.category && input.category !== existing.category) {
      changedFields.category = input.category;
    }

    await tx.incidentHistory.create({
      data: {
        incidentId,
        actorId: user.id,
        action: isModifyingClassification ? "SEVERITY_ASSESSED" : "UPDATED",
        fromStatus: existing.status,
        toStatus: existing.status,
        notes: "Incident details updated",
        metadata: changedFields as Prisma.InputJsonValue,
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        action: "INCIDENT_UPDATED",
        entityType: "Incident",
        entityId: incidentId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: changedFields as Prisma.InputJsonValue,
      },
      tx
    );

    await stageOutboxEvent(tx, {
      eventId: `evt_${crypto.randomUUID()}`,
      version: EVENT_VERSION,
      eventType: "INCIDENT_UPDATED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: updated.id,
      actorId: user.id,
      data: {
        incidentId: updated.id,
        incidentNumber: updated.incidentNumber,
        changedFields,
        severity: updated.severity,
        priority: updated.priority,
        title: updated.title,
        category: updated.category,
      },
    });

    return updated;
  });

  triggerOutboxDispatch();

  await publishIncidentEvent({
    eventType: "INCIDENT_UPDATED",
    incidentId: updatedIncident.id,
    incidentNumber: updatedIncident.incidentNumber,
    actorId: user.id,
    timestamp: new Date().toISOString(),
    data: {
      severity: updatedIncident.severity,
      priority: updatedIncident.priority,
    },
  });

  return updatedIncident;
}

/**
 * Transitions incident lifecycle status according to the valid state machine.
 */
export async function changeIncidentStatus(
  user: AuthenticatedUser,
  incidentId: string,
  input: ChangeStatusInput,
  meta: RequestMeta = {}
) {
  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { assignments: { where: { isActive: true } } },
  });

  if (!existing) {
    throw new IncidentNotFoundError();
  }

  const targetStatus = input.status as IncidentStatus;
  const currentStatus = existing.status;

  if (currentStatus === targetStatus) {
    return existing;
  }

  // 1. Lifecycle transition validation
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new InvalidTransitionError(currentStatus, targetStatus);
  }

  // 2. Resource-level authorization & AUDITOR write block
  const assigneeIds = [
    existing.assignedToId,
    ...existing.assignments.map((a) => a.userId),
  ].filter(Boolean);

  const authResult =  authorizeResourceAccess(user, {
    actionPrefix: "incident:update",
    ownerId: existing.reportedById,
    assigneeIds,
    isWriteAction: true,
  });

  if (!authResult.allowed) {
    throw new ForbiddenOperationError(authResult.reason);
  }

  // 3. Status-specific RBAC permissions
  if (targetStatus === IncidentStatus.RESOLVED || targetStatus === IncidentStatus.CLOSED) {
    if (!user.hasPermission("incident:close")) {
      throw new ForbiddenOperationError(
        "Missing incident:close permission to resolve or close incidents"
      );
    }
  } else if (targetStatus === IncidentStatus.ESCALATED) {
    if (!user.hasPermission("incident:escalate")) {
      throw new ForbiddenOperationError(
        "Missing incident:escalate permission to escalate incidents"
      );
    }
  } else if (targetStatus === IncidentStatus.TRIAGED || targetStatus === IncidentStatus.REJECTED) {
    if (!user.hasPermission("incident:assess") && !user.hasPermission("incident:update")) {
      throw new ForbiddenOperationError(
        "Missing incident:assess or incident:update permission to triage or reject incidents"
      );
    }
  } else {
    if (!user.hasPermission("incident:update")) {
      throw new ForbiddenOperationError("Missing incident:update permission");
    }
  }

  // Date updates based on terminal states
  let resolvedAt: Date | null = existing.resolvedAt;
  let closedAt: Date | null = existing.closedAt;

  if (targetStatus === IncidentStatus.RESOLVED) {
    resolvedAt = new Date();
  } else if (targetStatus === IncidentStatus.CLOSED) {
    closedAt = new Date();
    if (!resolvedAt) resolvedAt = new Date();
  } else if (targetStatus === IncidentStatus.REOPENED) {
    resolvedAt = null;
    closedAt = null;
  }

  const updatedIncident = await prisma.$transaction(async (tx) => {
    const updated = await tx.incident.update({
      where: { id: incidentId },
      data: {
        status: targetStatus,
        resolvedAt,
        closedAt,
      },
      include: {
        reportedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await tx.incidentHistory.create({
      data: {
        incidentId,
        actorId: user.id,
        action: "STATUS_CHANGE",
        fromStatus: currentStatus,
        toStatus: targetStatus,
        notes: input.notes || `Status transitioned from ${currentStatus} to ${targetStatus}`,
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        action: "INCIDENT_STATUS_CHANGED",
        entityType: "Incident",
        entityId: incidentId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          fromStatus: currentStatus,
          toStatus: targetStatus,
          notes: input.notes,
        },
      },
      tx
    );

    const isEscalation = targetStatus === IncidentStatus.ESCALATED;
    await stageOutboxEvent(tx, {
      eventId: `evt_${crypto.randomUUID()}`,
      version: EVENT_VERSION,
      eventType: isEscalation ? "INCIDENT_ESCALATED" : "INCIDENT_STATUS_CHANGED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: updated.id,
      actorId: user.id,
      data: isEscalation
        ? {
            incidentId: updated.id,
            incidentNumber: updated.incidentNumber,
            fromStatus: currentStatus,
            toStatus: "ESCALATED",
            severity: updated.severity,
            notes: input.notes,
          }
        : {
            incidentId: updated.id,
            incidentNumber: updated.incidentNumber,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            notes: input.notes,
          },
    });

    return updated;
  });

  triggerOutboxDispatch();

  await publishIncidentEvent({
    eventType:
      targetStatus === IncidentStatus.RESOLVED
        ? "INCIDENT_RESOLVED"
        : targetStatus === IncidentStatus.CLOSED
        ? "INCIDENT_CLOSED"
        : targetStatus === IncidentStatus.ESCALATED
        ? "INCIDENT_ESCALATED"
        : "INCIDENT_STATUS_CHANGED",
    incidentId: updatedIncident.id,
    incidentNumber: updatedIncident.incidentNumber,
    actorId: user.id,
    timestamp: new Date().toISOString(),
    data: {
      fromStatus: currentStatus,
      toStatus: targetStatus,
    },
  });

  return updatedIncident;
}

/**
 * Assigns or reassigns an incident to a responder.
 * Requires `incident:assign` permission (INCIDENT_COMMANDER).
 */
export async function assignIncident(
  user: AuthenticatedUser,
  incidentId: string,
  input: AssignIncidentInput,
  meta: RequestMeta = {}
) {
  if (!user.hasPermission("incident:assign")) {
    throw new ForbiddenOperationError(
      "Missing incident:assign permission to assign or reassign incidents"
    );
  }

  // Security rule: AUDITOR strictly blocked
  if (user.hasRole("AUDITOR")) {
    throw new ForbiddenOperationError("Auditors cannot perform assignment operations");
  }

  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      assignments: { where: { isActive: true } },
    },
  });

  if (!existing) {
    throw new IncidentNotFoundError();
  }

  // Verify target user exists, is active, and possesses an appropriate responder role
  const targetUser = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { roles: { include: { role: true } } },
  });

  if (!targetUser) {
    throw new BadRequestError("ASSIGNEE_NOT_FOUND", "The target user does not exist");
  }

  if (targetUser.status !== "ACTIVE") {
    throw new BadRequestError(
      "ASSIGNEE_INACTIVE",
      "Cannot assign incidents to a user who is not active"
    );
  }

  const responderRoles = [
    "INVESTIGATOR",
    "SECURITY_ENGINEER",
    "INCIDENT_COMMANDER",
    "SECURITY_ANALYST",
  ];
  const hasResponderRole = targetUser.roles.some((r) =>
    responderRoles.includes(r.role.code)
  );

  if (!hasResponderRole) {
    throw new BadRequestError(
      "INVALID_ASSIGNEE_ROLE",
      "Incidents can only be assigned to responders (Investigators, Engineers, Analysts, Commanders)"
    );
  }

  // Status auto-advancement: if status is NEW or TRIAGED, advance to ASSIGNED
  let newStatus: IncidentStatus = existing.status;
  if (existing.status === IncidentStatus.NEW || existing.status === IncidentStatus.TRIAGED) {
    newStatus = IncidentStatus.ASSIGNED;
  }

  const updatedIncident = await prisma.$transaction(async (tx) => {
    // If primary responder changes, deactivate existing active assignment
    if (input.role === "PRIMARY_RESPONDER") {
      await tx.incidentAssignment.updateMany({
        where: {
          incidentId,
          role: "PRIMARY_RESPONDER",
          isActive: true,
        },
        data: {
          isActive: false,
          unassignedAt: new Date(),
        },
      });
    }

    // Create new assignment record
    await tx.incidentAssignment.create({
      data: {
        incidentId,
        userId: targetUser.id,
        role: input.role || "PRIMARY_RESPONDER",
        assignedById: user.id,
        isActive: true,
      },
    });

    // Update incident
    const updated = await tx.incident.update({
      where: { id: incidentId },
      data: {
        assignedToId:
          input.role === "PRIMARY_RESPONDER" || !existing.assignedToId
            ? targetUser.id
            : existing.assignedToId,
        status: newStatus,
      },
      include: {
        reportedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        assignments: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    await tx.incidentHistory.create({
      data: {
        incidentId,
        actorId: user.id,
        action: "ASSIGNED",
        fromStatus: existing.status,
        toStatus: newStatus,
        notes:
          input.notes ||
          `Assigned to ${targetUser.firstName} ${targetUser.lastName} (${input.role})`,
        metadata: {
          assignedUserId: targetUser.id,
          assignedRole: input.role,
        },
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        action: "INCIDENT_ASSIGNED",
        entityType: "Incident",
        entityId: incidentId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          assigneeId: targetUser.id,
          assigneeEmail: targetUser.email,
          role: input.role,
          statusChange: existing.status !== newStatus ? { from: existing.status, to: newStatus } : null,
        },
      },
      tx
    );

    await stageOutboxEvent(tx, {
      eventId: `evt_${crypto.randomUUID()}`,
      version: EVENT_VERSION,
      eventType: "INCIDENT_ASSIGNED",
      topic: TOPICS.INCIDENT_EVENTS,
      timestamp: new Date().toISOString(),
      producer: "suraksha-backend",
      aggregateType: "INCIDENT",
      aggregateId: updated.id,
      actorId: user.id,
      data: {
        incidentId: updated.id,
        incidentNumber: updated.incidentNumber,
        assignedToId: targetUser.id,
        assignedToEmail: targetUser.email,
        assignedById: user.id,
        role: input.role || "PRIMARY_RESPONDER",
        status: updated.status,
      },
    });

    return updated;
  });

  triggerOutboxDispatch();

  await publishIncidentEvent({
    eventType: "INCIDENT_ASSIGNED",
    incidentId: updatedIncident.id,
    incidentNumber: updatedIncident.incidentNumber,
    actorId: user.id,
    timestamp: new Date().toISOString(),
    data: {
      assignedToId: targetUser.id,
      assignedToEmail: targetUser.email,
      role: input.role,
      status: updatedIncident.status,
    },
  });

  return updatedIncident;
}



/**
 * Retrieves the list of active users eligible for incident response assignments.
 */
export async function getActiveResponders() {
  const responderRoles = [
    "INVESTIGATOR",
    "SECURITY_ENGINEER",
    "INCIDENT_COMMANDER",
    "SECURITY_ANALYST",
  ];

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: {
        some: {
          role: {
            code: { in: responderRoles },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      roles: {
        select: {
          role: {
            select: { code: true, name: true },
          },
        },
      },
    },
    orderBy: { firstName: "asc" },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    roles: u.roles.map((r) => r.role.code),
  }));
}

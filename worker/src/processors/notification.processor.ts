import { prisma } from "../config/prisma.js";
import { publishNotificationDispatched } from "../publishers/notification.publisher.js";
import {
  EventEnvelope,
  IncidentCreatedData,
  IncidentUpdatedData,
  IncidentAssignedData,
  IncidentStatusChangedData,
  IncidentEscalatedData,
  AiAnalysisCompletedData,
  RemediationSuggestionsGeneratedData,
} from "../events/eventTypes.js";

async function getUsersWithRoles(roleCodes: string[]): Promise<Array<{ id: string; email: string }>> {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: {
        some: {
          role: {
            OR: [
              { code: { in: roleCodes } },
              { name: { in: roleCodes } },
            ],
          },
        },
      },
    },
    select: { id: true, email: true },
  });
}

async function createAndDispatchNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
    },
  });

  try {
    await publishNotificationDispatched({
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
    });
  } catch (err) {
    console.warn(
      `[Worker] Created notification ${notification.id} but failed to dispatch Kafka event:`,
      err
    );
  }
}

export async function processNotificationEvent(event: EventEnvelope): Promise<void> {
  switch (event.eventType) {
    case "INCIDENT_CREATED": {
      const data = event.data as IncidentCreatedData;
      if (data.reportedById) {
        await createAndDispatchNotification({
          userId: data.reportedById,
          title: `Incident Logged: ${data.incidentNumber}`,
          message: `Your incident report ${data.incidentNumber} ("${data.title}") was successfully registered.`,
          type: "INCIDENT_CREATED",
          entityType: "INCIDENT",
          entityId: data.incidentId,
          metadata: { incidentNumber: data.incidentNumber, severity: data.severity },
        });
      }

      if (data.severity === "CRITICAL" || data.severity === "HIGH") {
        const securityTeam = await getUsersWithRoles([
          "INCIDENT_COMMANDER",
          "SECURITY_ENGINEER",
          "SECURITY_ANALYST",
        ]);

        for (const user of securityTeam) {
          if (user.id !== data.reportedById) {
            await createAndDispatchNotification({
              userId: user.id,
              title: `High Priority Alert: ${data.incidentNumber}`,
              message: `A ${data.severity} incident ${data.incidentNumber} ("${data.title}") was reported in ${data.category}.`,
              type: "INCIDENT_ALERT",
              entityType: "INCIDENT",
              entityId: data.incidentId,
              metadata: { incidentNumber: data.incidentNumber, severity: data.severity },
            });
          }
        }
      }
      break;
    }

    case "INCIDENT_ASSIGNED": {
      const data = event.data as IncidentAssignedData;
      if (data.assignedToId) {
        await createAndDispatchNotification({
          userId: data.assignedToId,
          title: `Assigned: ${data.incidentNumber}`,
          message: `You were assigned as ${data.role || "PRIMARY_RESPONDER"} to incident ${data.incidentNumber}.`,
          type: "INCIDENT_ASSIGNED",
          entityType: "INCIDENT",
          entityId: data.incidentId,
          metadata: {
            incidentNumber: data.incidentNumber,
            assignedById: data.assignedById,
            role: data.role,
          },
        });
      }
      break;
    }

    case "INCIDENT_ESCALATED": {
      const data = event.data as IncidentEscalatedData;
      const commanders = await getUsersWithRoles(["INCIDENT_COMMANDER", "ADMIN"]);

      for (const commander of commanders) {
        await createAndDispatchNotification({
          userId: commander.id,
          title: `Incident Escalated: ${data.incidentNumber}`,
          message: `Incident ${data.incidentNumber} was escalated to ESCALATED. Reason: ${data.notes || "Manual escalation"}.`,
          type: "INCIDENT_ESCALATED",
          entityType: "INCIDENT",
          entityId: data.incidentId,
          metadata: {
            incidentNumber: data.incidentNumber,
            severity: data.severity,
            fromStatus: data.fromStatus,
            notes: data.notes,
            actorId: event.actorId,
          },
        });
      }
      break;
    }

    case "INCIDENT_STATUS_CHANGED": {
      const data = event.data as IncidentStatusChangedData;
      const incident = await prisma.incident.findUnique({
        where: { id: data.incidentId },
        select: { id: true, reportedById: true, assignedToId: true, title: true, incidentNumber: true },
      });

      if (incident) {
        const recipients = new Set<string>();
        if (incident.reportedById && incident.reportedById !== event.actorId) {
          recipients.add(incident.reportedById);
        }
        if (incident.assignedToId && incident.assignedToId !== event.actorId) {
          recipients.add(incident.assignedToId);
        }
        if (["RESOLVED", "CLOSED"].includes(data.toStatus) && incident.reportedById) {
          recipients.add(incident.reportedById);
        }

        for (const userId of recipients) {
          await createAndDispatchNotification({
            userId,
            title: `Status Changed: ${data.incidentNumber}`,
            message: `Incident ${data.incidentNumber} status changed from ${data.fromStatus} to ${data.toStatus}.`,
            type: "INCIDENT_STATUS_CHANGED",
            entityType: "INCIDENT",
            entityId: data.incidentId,
            metadata: {
              incidentNumber: data.incidentNumber,
              fromStatus: data.fromStatus,
              toStatus: data.toStatus,
              notes: data.notes,
            },
          });
        }
      }
      break;
    }

    case "INCIDENT_UPDATED": {
      const data = event.data as IncidentUpdatedData;
      console.log(`[Worker] Processed incident update for ${data.incidentNumber}`);
      break;
    }

    case "AI_ANALYSIS_COMPLETED": {
      const data = event.data as AiAnalysisCompletedData;
      const incident = await prisma.incident.findUnique({
        where: { id: data.incidentId },
        select: { assignedToId: true },
      });

      if (incident?.assignedToId && incident.assignedToId !== data.actorId) {
        await createAndDispatchNotification({
          userId: incident.assignedToId,
          title: `AI Analysis Complete: ${data.incidentNumber}`,
          message: `AI analysis completed with ${data.factsCount} facts and ${data.hypothesesCount} hypotheses.`,
          type: "AI_ANALYSIS_COMPLETED",
          entityType: "INCIDENT",
          entityId: data.incidentId,
          metadata: { incidentNumber: data.incidentNumber, confidence: data.confidence },
        });
      }
      break;
    }

    case "REMEDIATION_SUGGESTIONS_GENERATED": {
      const data = event.data as RemediationSuggestionsGeneratedData;
      const incident = await prisma.incident.findUnique({
        where: { id: data.incidentId },
        select: { assignedToId: true },
      });

      if (incident?.assignedToId && incident.assignedToId !== data.actorId) {
        await createAndDispatchNotification({
          userId: incident.assignedToId,
          title: `AI Remediation Generated: ${data.incidentNumber}`,
          message: `${data.recommendationsCount} remediation recommendations generated for ${data.incidentNumber}.`,
          type: "REMEDIATION_SUGGESTIONS_GENERATED",
          entityType: "INCIDENT",
          entityId: data.incidentId,
          metadata: { incidentNumber: data.incidentNumber, riskFlags: data.riskFlags },
        });
      }
      break;
    }

    case "AI_REPORT_GENERATED":
    case "NOTIFICATION_DISPATCHED":
      // Handled or informational
      break;

    default:
      console.warn(`[Worker] Unhandled event type: ${(event as any).eventType}`);
  }
}

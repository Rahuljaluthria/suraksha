import { kafkaProducer } from "../config/kafka.js";

export type IncidentEventType =
  | "INCIDENT_CREATED"
  | "INCIDENT_UPDATED"
  | "INCIDENT_STATUS_CHANGED"
  | "INCIDENT_ASSIGNED"
  | "INCIDENT_ESCALATED"
  | "INCIDENT_RESOLVED"
  | "INCIDENT_CLOSED";

export interface IncidentEventPayload {
  eventType: IncidentEventType;
  incidentId: string;
  incidentNumber: string;
  actorId?: string | null;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Publishes an event to the "incident-events" Kafka topic.
 * Errors are caught and logged so event publication failure never aborts
 * database transactions or core request fulfillment.
 */
export async function publishIncidentEvent(event: IncidentEventPayload): Promise<void> {
  try {
    await kafkaProducer.send({
      topic: "incident-events",
      messages: [
        {
          key: event.incidentId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            timestamp: event.timestamp,
          },
        },
      ],
    });
  } catch (error) {
    console.warn(`[Kafka] Non-blocking: Failed to publish ${event.eventType} for ${event.incidentId}:`, error);
  }
}
